import { eq } from "drizzle-orm";
import { clients, tenantDb, type Client } from "@rep/db";
import type { CreateClientInput, UpdateClientInput } from "./clients.schema.js";

// Lógica de negocio de clientes. SIEMPRE vía tenantDb() → aislamiento por tenant
// garantizado por el scoping de @rep/db (imposible ver/tocar clientes de otro tenant).
// Los `.returning()` del helper scoped devuelven filas sin tipar → cast a Client.

export async function listClients(): Promise<Client[]> {
  const rows = await tenantDb().select(clients);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function createClient(input: CreateClientInput): Promise<Client> {
  const rows = (await tenantDb().insert(clients, input).returning()) as Client[];
  return rows[0]!;
}

export async function updateClient(
  id: string,
  input: UpdateClientInput,
): Promise<Client | null> {
  const rows = (await tenantDb()
    .update(clients, input, eq(clients.id, id))
    .returning()) as Client[];
  return rows[0] ?? null;
}

export async function deleteClient(id: string): Promise<boolean> {
  const rows = (await tenantDb().delete(clients, eq(clients.id, id)).returning()) as Client[];
  return rows.length > 0;
}

// ---------- perfil de cliente (roles derivados + timeline + notas) ----------

import { inArray } from "drizzle-orm";
import {
  clientNotes,
  invoicePayments,
  invoices,
  properties,
  rentalPayments,
  rentals,
  visits,
  type ClientNote,
  type Invoice,
  type InvoicePayment,
  type Property,
  type Rental,
  type RentalPayment,
  type Visit,
} from "@rep/db";

export type TimelineEvent = { at: string; type: string; label: string };

export type ClientFinance = {
  facturadoCents: number; // total facturado (income, sin anuladas)
  cobradoCents: number;
  pendienteCents: number;
  invoiceCount: number;
  recent: Array<{
    id: string;
    direction: Invoice["direction"];
    concept: string | null;
    number: string | null;
    issueDate: string;
    totalCents: number;
    status: Invoice["status"];
  }>;
};
export type ClientVisit = {
  id: string;
  propertyTitle: string;
  at: string;
  status: Visit["status"];
};

export type ClientProfile = {
  client: Client;
  ownedProperties: Array<{ id: string; title: string; status: Property["status"] }>;
  rentingContracts: Array<{
    rentalId: string;
    propertyTitle: string;
    monthlyRent: number;
    status: Rental["status"];
    since: string;
  }>;
  interestProperty: { id: string; title: string } | null;
  finance: ClientFinance;
  visits: { upcoming: ClientVisit[]; past: ClientVisit[] };
  timeline: TimelineEvent[];
  notes: ClientNote[];
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "alta manual",
  microsite: "lead del micrositio",
  valuation: "solicitud de valoración",
};

export async function getClientProfile(id: string): Promise<ClientProfile | null> {
  const rows = (await tenantDb().select(clients, eq(clients.id, id))) as Client[];
  const client = rows[0];
  if (!client) return null;

  const [owned, renting, clientVisits, notes, clientInvoices] = await Promise.all([
    tenantDb().select(properties, eq(properties.ownerClientId, id)) as Promise<Property[]>,
    tenantDb().select(rentals, eq(rentals.renterClientId, id)) as Promise<Rental[]>,
    tenantDb().select(visits, eq(visits.clientId, id)) as Promise<Visit[]>,
    tenantDb().select(clientNotes, eq(clientNotes.clientId, id)) as Promise<ClientNote[]>,
    tenantDb().select(invoices, eq(invoices.clientId, id)) as Promise<Invoice[]>,
  ]);

  // Finanzas del cliente (facturas emitidas a su nombre).
  const invPays =
    clientInvoices.length > 0
      ? ((await tenantDb().select(
          invoicePayments,
          inArray(invoicePayments.invoiceId, clientInvoices.map((i) => i.id)),
        )) as InvoicePayment[])
      : [];
  const paidByInvoice = new Map<string, number>();
  for (const p of invPays) paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amountCents);
  const activeInv = clientInvoices.filter((i) => i.status !== "cancelled");
  const incomeInv = activeInv.filter((i) => i.direction === "income");
  const facturadoCents = incomeInv.reduce((a, i) => a + i.totalCents, 0);
  const cobradoCents = incomeInv.reduce((a, i) => a + Math.min(i.totalCents, paidByInvoice.get(i.id) ?? 0), 0);
  const finance: ClientFinance = {
    facturadoCents,
    cobradoCents,
    pendienteCents: Math.max(0, facturadoCents - cobradoCents),
    invoiceCount: incomeInv.length,
    recent: [...activeInv]
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
      .slice(0, 6)
      .map((i) => ({
        id: i.id,
        direction: i.direction,
        concept: i.concept,
        number: i.number,
        issueDate: i.issueDate,
        totalCents: i.totalCents,
        status: i.status,
      })),
  };

  // Pagos de sus contratos como inquilino (para el timeline).
  const pays =
    renting.length > 0
      ? ((await tenantDb().select(
          rentalPayments,
          inArray(rentalPayments.rentalId, renting.map((r) => r.id)),
        )) as RentalPayment[])
      : [];

  // Títulos de inmuebles referenciados (visitas, contratos, interés).
  const refIds = [
    ...new Set(
      [
        ...clientVisits.map((v) => v.propertyId),
        ...renting.map((r) => r.propertyId),
        client.interestPropertyId,
      ].filter((x): x is string => Boolean(x)),
    ),
  ];
  const refProps =
    refIds.length > 0
      ? ((await tenantDb().select(properties, inArray(properties.id, refIds))) as Property[])
      : [];
  const title = (pid: string | null) =>
    refProps.find((p) => p.id === pid)?.title ?? "un inmueble";

  const eur = (n: number) => `${new Intl.NumberFormat("es-ES").format(n)} €`;
  const MONTHS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];

  const timeline: TimelineEvent[] = [
    {
      at: client.createdAt.toISOString(),
      type: "created",
      label: `Alta como cliente (${SOURCE_LABEL[client.source] ?? client.source})`,
    },
    ...clientVisits.map((v) => ({
      at: v.createdAt.toISOString(),
      type: "visit",
      label: `Solicitó visita a "${title(v.propertyId)}" (${
        { requested: "pendiente", confirmed: "confirmada", done: "hecha", cancelled: "cancelada" }[v.status]
      })`,
    })),
    ...renting.map((r) => ({
      at: r.createdAt.toISOString(),
      type: "rental",
      label: `Contrato de alquiler de "${title(r.propertyId)}" — ${eur(r.monthlyRent)}/mes`,
    })),
    ...pays
      .filter((p) => p.status === "paid" && p.paidAt)
      .map((p) => ({
        at: p.paidAt!.toISOString(),
        type: "payment",
        label: `Renta de ${MONTHS[Number(p.period.slice(5, 7)) - 1]} cobrada (${eur(p.amount)})`,
      })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 50);

  return {
    client,
    ownedProperties: owned.map((p) => ({ id: p.id, title: p.title, status: p.status })),
    rentingContracts: renting.map((r) => ({
      rentalId: r.id,
      propertyTitle: title(r.propertyId),
      monthlyRent: r.monthlyRent,
      status: r.status,
      since: r.startDate,
    })),
    interestProperty: client.interestPropertyId
      ? { id: client.interestPropertyId, title: title(client.interestPropertyId) }
      : null,
    finance,
    visits: (() => {
      const now = Date.now();
      const isUpcoming = (v: Visit) =>
        v.scheduledAt.getTime() >= now && (v.status === "requested" || v.status === "confirmed");
      const toOut = (v: Visit): ClientVisit => ({
        id: v.id,
        propertyTitle: title(v.propertyId),
        at: v.scheduledAt.toISOString(),
        status: v.status,
      });
      return {
        upcoming: clientVisits
          .filter(isUpcoming)
          .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
          .map(toOut),
        past: clientVisits
          .filter((v) => !isUpcoming(v))
          .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
          .slice(0, 12)
          .map(toOut),
      };
    })(),
    timeline,
    notes: notes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  };
}

export async function addClientNote(clientId: string, body: string): Promise<ClientNote | null> {
  const exists = (await tenantDb().select(clients, eq(clients.id, clientId))) as Client[];
  if (exists.length === 0) return null;
  const rows = (await tenantDb()
    .insert(clientNotes, { clientId, body })
    .returning()) as ClientNote[];
  return rows[0]!;
}
