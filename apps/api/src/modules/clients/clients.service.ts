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
  properties,
  rentalPayments,
  rentals,
  visits,
  type ClientNote,
  type Property,
  type Rental,
  type RentalPayment,
  type Visit,
} from "@rep/db";

export type TimelineEvent = { at: string; type: string; label: string };

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

  const [owned, renting, clientVisits, notes] = await Promise.all([
    tenantDb().select(properties, eq(properties.ownerClientId, id)) as Promise<Property[]>,
    tenantDb().select(rentals, eq(rentals.renterClientId, id)) as Promise<Rental[]>,
    tenantDb().select(visits, eq(visits.clientId, id)) as Promise<Visit[]>,
    tenantDb().select(clientNotes, eq(clientNotes.clientId, id)) as Promise<ClientNote[]>,
  ]);

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
