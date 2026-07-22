import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import {
  clients,
  invoices,
  properties,
  propertyRooms,
  rentalPayments,
  rentals,
  tenantDb,
  visits,
  type Client,
  type Invoice,
  type InvoiceCategory,
  type Property,
  type PropertyRoom,
  type Rental,
  type RentalPayment,
  type Visit,
} from "@rep/db";
import {
  getPropertySettlement,
  isOwnerSettlementVisible,
  type PropertySettlement,
} from "../rentals/shared-expenses.service.js";

// Portal del propietario: el token es la credencial (capability URL) que la
// agencia genera y comparte. Todo va por tenantDb → un token solo funciona
// bajo el dominio/slug de SU inmobiliaria.

export type PortalTokenResult =
  | { ok: true; token: string }
  | { ok: false; error: "not_found" | "no_properties" };

/** El portal es SOLO para clientes con inmuebles asignados (propietarios). */
export async function getOrCreatePortalToken(clientId: string): Promise<PortalTokenResult> {
  const rows = (await tenantDb().select(clients, eq(clients.id, clientId))) as Client[];
  const client = rows[0];
  if (!client) return { ok: false, error: "not_found" };

  const owned = await tenantDb().select(properties, eq(properties.ownerClientId, clientId));
  if (owned.length === 0) return { ok: false, error: "no_properties" };

  if (client.portalToken) return { ok: true, token: client.portalToken };
  const token = randomUUID();
  await tenantDb().update(clients, { portalToken: token }, eq(clients.id, clientId));
  return { ok: true, token };
}

// Lo que el propietario ve de cada inmueble suyo. Las visitas van SIN datos
// personales del visitante (solo fecha y estado) — no son asunto del dueño.
// Rendimiento del alquiler (cifras agregadas del inmueble). SIN identidad del
// inquilino (misma política que las visitas).
// Una línea por contrato relevante: piso entero (label null) o una habitación.
export type PortalRoomLine = {
  label: string | null; // nombre de la habitación; null = piso entero
  monthlyRent: number;
  active: boolean;
  collectedThisYear: number;
  pendingMonths: number; // meses pendientes de cobro (solo cuenta si activa)
};
export type PortalRental = {
  monthlyRent: number; // suma de las líneas
  active: boolean; // true si alguna línea está activa
  byRoom: boolean; // true si el inmueble se alquila por habitaciones
  collectedThisYear: number; // suma
  rooms: PortalRoomLine[]; // desglose (piso entero = 1 línea con label null)
};

// Gasto visible para el propietario, con su factura descargable si la hay.
// (Viene de invoices con direction='expense' — ver módulo invoices.)
export type PortalExpense = {
  date: string;
  category: InvoiceCategory;
  concept: string | null;
  amountCents: number;
  fileUrl: string | null;
};

export type PortalProperty = {
  id: string;
  title: string;
  status: Property["status"];
  operation: Property["operation"];
  price: number | null;
  city: string | null;
  photo: string | null;
  upcomingVisits: Array<{ at: string; status: Visit["status"] }>;
  visitsDone: number;
  interested: number;
  rental: PortalRental | null;
  expensesThisYearCents: number;
  latestExpenses: PortalExpense[];
  monthly: PortalMonthly[]; // 12 meses del año en curso
};

// Serie mensual del año en curso para el gráfico ingresos vs gastos.
export type PortalMonthly = { month: number; incomeCents: number; expenseCents: number };

// Resumen agregado de TODOS los inmuebles del propietario.
export type PortalSummary = {
  collectedThisYearCents: number;
  expensesThisYearCents: number;
  netThisYearCents: number;
  pendingPayments: number; // meses pendientes de cobro (contratos activos)
};

export type PortalData = {
  owner: { name: string };
  summary: PortalSummary;
  properties: PortalProperty[];
};

/** Contratos relevantes de un inmueble: los activos; si no hay ninguno, el más
 *  reciente aunque esté finalizado (sus cobros del año siguen contando). */
function relevantRentalsOf(all: Rental[]): Rental[] {
  const active = all.filter((r) => r.status === "active");
  if (active.length > 0) return active;
  const latest = [...all].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return latest ? [latest] : [];
}

export async function getPortalData(token: string): Promise<PortalData | null> {
  const owners = (await tenantDb().select(clients, eq(clients.portalToken, token))) as Client[];
  const owner = owners[0];
  if (!owner) return null;

  const owned = (await tenantDb().select(
    properties,
    eq(properties.ownerClientId, owner.id),
  )) as Property[];
  const emptySummary: PortalSummary = {
    collectedThisYearCents: 0,
    expensesThisYearCents: 0,
    netThisYearCents: 0,
    pendingPayments: 0,
  };
  if (owned.length === 0) {
    return { owner: { name: owner.name }, summary: emptySummary, properties: [] };
  }

  const ids = owned.map((p) => p.id);
  const [allVisits, interestedClients, allRentals, allExpenses] = await Promise.all([
    tenantDb().select(visits, inArray(visits.propertyId, ids)) as Promise<Visit[]>,
    tenantDb().select(clients, inArray(clients.interestPropertyId, ids)) as Promise<Client[]>,
    tenantDb().select(rentals, inArray(rentals.propertyId, ids)) as Promise<Rental[]>,
    tenantDb().select(
      invoices,
      and(
        inArray(invoices.propertyId, ids),
        eq(invoices.direction, "expense"),
        ne(invoices.status, "cancelled"),
      ),
    ) as Promise<Invoice[]>,
  ]);

  // Contratos relevantes por inmueble: TODOS los activos (piso entero o varias
  // habitaciones); si no hay ninguno activo, el más reciente aunque esté finalizado
  // (sus cobros de este año siguen siendo ingresos reales).
  const relevantByProperty = new Map<string, Rental[]>();
  for (const id of ids) {
    const rel = relevantRentalsOf(allRentals.filter((r) => r.propertyId === id));
    if (rel.length > 0) relevantByProperty.set(id, rel);
  }
  const relevantRentals = [...relevantByProperty.values()].flat();

  const roomIds = relevantRentals.map((r) => r.roomId).filter(Boolean) as string[];
  const roomRows = roomIds.length
    ? ((await tenantDb().select(propertyRooms, inArray(propertyRooms.id, roomIds))) as PropertyRoom[])
    : [];
  const roomName = (id: string | null): string | null =>
    id ? (roomRows.find((x) => x.id === id)?.name ?? "Habitación") : null;

  const payments =
    relevantRentals.length > 0
      ? ((await tenantDb().select(
          rentalPayments,
          inArray(rentalPayments.rentalId, relevantRentals.map((r) => r.id)),
        )) as RentalPayment[])
      : [];

  const yearPrefix = `${new Date().getFullYear()}-`;
  const toPortalRental = (propertyId: string): PortalRental | null => {
    const rs = relevantByProperty.get(propertyId);
    if (!rs || rs.length === 0) return null;
    const lines: PortalRoomLine[] = rs
      .map((rental) => {
        const pays = payments.filter((p) => p.rentalId === rental.id);
        const active = rental.status === "active";
        return {
          label: roomName(rental.roomId),
          monthlyRent: rental.monthlyRent,
          active,
          collectedThisYear: pays
            .filter((p) => p.status === "paid" && p.period.startsWith(yearPrefix))
            .reduce((acc, p) => acc + p.amount, 0),
          pendingMonths: active ? pays.filter((p) => p.status === "pending").length : 0,
        };
      })
      .sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "", "es"));
    return {
      monthlyRent: lines.reduce((a, l) => a + l.monthlyRent, 0),
      active: lines.some((l) => l.active),
      byRoom: rs.some((r) => r.roomId != null),
      collectedThisYear: lines.reduce((a, l) => a + l.collectedThisYear, 0),
      rooms: lines,
    };
  };

  // Serie mensual (año en curso) de un inmueble: cobros pagados vs gastos.
  const monthlyFor = (propertyId: string): PortalMonthly[] => {
    const rentalIds = new Set((relevantByProperty.get(propertyId) ?? []).map((r) => r.id));
    const paid = payments.filter(
      (p) => rentalIds.has(p.rentalId) && p.status === "paid" && p.period.startsWith(yearPrefix),
    );
    const exps = allExpenses.filter(
      (e) => e.propertyId === propertyId && e.issueDate.startsWith(yearPrefix),
    );
    return Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, "0");
      return {
        month: i + 1,
        incomeCents:
          paid.filter((p) => p.period.slice(5, 7) === mm).reduce((a, p) => a + p.amount, 0) * 100,
        expenseCents: exps
          .filter((e) => e.issueDate.slice(5, 7) === mm)
          .reduce((a, e) => a + e.totalCents, 0),
      };
    });
  };

  const now = Date.now();
  const mapped = {
    owner: { name: owner.name },
    properties: owned.map((p) => {
      const vs = allVisits.filter((v) => v.propertyId === p.id);
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        operation: p.operation,
        price: p.price,
        city: p.city,
        photo: p.photos[0] ?? null,
        upcomingVisits: vs
          .filter(
            (v) =>
              v.scheduledAt.getTime() >= now &&
              (v.status === "requested" || v.status === "confirmed"),
          )
          .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
          .map((v) => ({ at: v.scheduledAt.toISOString(), status: v.status })),
        visitsDone: vs.filter((v) => v.status === "done").length,
        interested: interestedClients.filter((cl) => cl.interestPropertyId === p.id).length,
        rental: toPortalRental(p.id),
        expensesThisYearCents: allExpenses
          .filter((e) => e.propertyId === p.id && e.issueDate.startsWith(yearPrefix))
          .reduce((acc, e) => acc + e.totalCents, 0),
        latestExpenses: allExpenses
          .filter((e) => e.propertyId === p.id)
          .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
          .slice(0, 6)
          .map((e) => ({
            date: e.issueDate,
            category: e.category,
            concept: e.concept,
            amountCents: e.totalCents,
            fileUrl: e.fileUrl,
          })),
        monthly: monthlyFor(p.id),
      };
    }),
  };

  // Resumen agregado del propietario (todas sus propiedades).
  const summary: PortalSummary = mapped.properties.reduce(
    (acc, p) => {
      const collected = (p.rental?.collectedThisYear ?? 0) * 100;
      acc.collectedThisYearCents += collected;
      acc.expensesThisYearCents += p.expensesThisYearCents;
      acc.netThisYearCents += collected - p.expensesThisYearCents;
      // Meses pendientes: suma de todas las líneas (habitaciones) activas del
      // inmueble. Un contrato finalizado ya no genera cobros por reclamar.
      acc.pendingPayments += p.rental
        ? p.rental.rooms.reduce((s, l) => s + l.pendingMonths, 0)
        : 0;
      return acc;
    },
    { ...emptySummary },
  );

  return { ...mapped, summary };
}

// ---------- detalle por inmueble (página con tabs del portal) ----------

export type PortalPaymentRow = {
  period: string; // "YYYY-MM"
  amount: number; // euros
  status: RentalPayment["status"];
  paidAt: string | null;
};

// Una habitación (o el piso entero) dentro del detalle de un inmueble.
export type PortalRentalRoom = {
  label: string | null; // nombre de la habitación; null = piso entero
  monthlyRent: number;
  status: Rental["status"];
  collectedThisYearCents: number;
  payments: PortalPaymentRow[]; // registro COMPLETO de esa línea, desc
};

export type PortalPropertyDetail = {
  owner: { name: string };
  property: {
    id: string;
    title: string;
    status: Property["status"];
    operation: Property["operation"];
    price: number | null;
    city: string | null;
    photo: string | null;
    interested: number;
  };
  rental: {
    monthlyRent: number; // suma de las habitaciones
    since: string; // inicio más antiguo
    active: boolean;
    byRoom: boolean;
    collectedThisYearCents: number; // suma
    rooms: PortalRentalRoom[]; // una línea por contrato (piso entero = 1, label null)
  } | null;
  expenses: PortalExpense[]; // todos, desc
  expensesByCategory: Array<{ category: InvoiceCategory; totalCents: number }>;
  visits: {
    upcoming: Array<{ at: string; status: Visit["status"] }>;
    past: Array<{ at: string; status: Visit["status"] }>;
  };
  monthly: PortalMonthly[];
  // Reparto de gastos entre inquilinos — solo si la inmobiliaria lo hace visible.
  settlement: PropertySettlement | null;
};

/**
 * Detalle de UN inmueble del propietario (por token + propertyId). null si el
 * token no existe o el inmueble no pertenece a ese propietario (→ 404).
 */
export async function getPortalPropertyDetail(
  token: string,
  propertyId: string,
): Promise<PortalPropertyDetail | null> {
  const owners = (await tenantDb().select(clients, eq(clients.portalToken, token))) as Client[];
  const owner = owners[0];
  if (!owner) return null;

  const props = (await tenantDb().select(
    properties,
    and(eq(properties.id, propertyId), eq(properties.ownerClientId, owner.id)),
  )) as Property[];
  const prop = props[0];
  if (!prop) return null;

  const [vs, interestedClients, propRentals, exps] = await Promise.all([
    tenantDb().select(visits, eq(visits.propertyId, prop.id)) as Promise<Visit[]>,
    tenantDb().select(clients, eq(clients.interestPropertyId, prop.id)) as Promise<Client[]>,
    tenantDb().select(rentals, eq(rentals.propertyId, prop.id)) as Promise<Rental[]>,
    tenantDb().select(
      invoices,
      and(
        eq(invoices.propertyId, prop.id),
        eq(invoices.direction, "expense"),
        ne(invoices.status, "cancelled"),
      ),
    ) as Promise<Invoice[]>,
  ]);

  // Contratos relevantes del inmueble (piso entero o varias habitaciones).
  const relevant = relevantRentalsOf(propRentals);
  const pays =
    relevant.length > 0
      ? ((await tenantDb().select(
          rentalPayments,
          inArray(rentalPayments.rentalId, relevant.map((r) => r.id)),
        )) as RentalPayment[])
      : [];
  const roomIds = relevant.map((r) => r.roomId).filter(Boolean) as string[];
  const roomRows = roomIds.length
    ? ((await tenantDb().select(propertyRooms, inArray(propertyRooms.id, roomIds))) as PropertyRoom[])
    : [];
  const roomName = (id: string | null): string | null =>
    id ? (roomRows.find((x) => x.id === id)?.name ?? "Habitación") : null;

  const yearPrefix = `${new Date().getFullYear()}-`;
  const now = Date.now();

  const byCategory = new Map<InvoiceCategory, number>();
  for (const e of exps) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.totalCents);
  }

  const monthly: PortalMonthly[] = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, "0");
    return {
      month: i + 1,
      incomeCents:
        pays
          .filter(
            (p) =>
              p.status === "paid" && p.period.startsWith(yearPrefix) && p.period.slice(5, 7) === mm,
          )
          .reduce((a, p) => a + p.amount, 0) * 100,
      expenseCents: exps
        .filter((e) => e.issueDate.startsWith(yearPrefix) && e.issueDate.slice(5, 7) === mm)
        .reduce((a, e) => a + e.totalCents, 0),
    };
  });

  return {
    owner: { name: owner.name },
    property: {
      id: prop.id,
      title: prop.title,
      status: prop.status,
      operation: prop.operation,
      price: prop.price,
      city: prop.city,
      photo: prop.photos[0] ?? null,
      interested: interestedClients.length,
    },
    rental:
      relevant.length > 0
        ? (() => {
            const rooms: PortalRentalRoom[] = relevant
              .map((r) => {
                const rp = pays.filter((p) => p.rentalId === r.id);
                return {
                  label: roomName(r.roomId),
                  monthlyRent: r.monthlyRent,
                  status: r.status,
                  collectedThisYearCents:
                    rp
                      .filter((p) => p.status === "paid" && p.period.startsWith(yearPrefix))
                      .reduce((a, p) => a + p.amount, 0) * 100,
                  payments: rp
                    .sort((a, b) => b.period.localeCompare(a.period))
                    .map((p) => ({
                      period: p.period.slice(0, 7),
                      amount: p.amount,
                      status: p.status,
                      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
                    })),
                };
              })
              .sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "", "es"));
            return {
              monthlyRent: rooms.reduce((a, l) => a + l.monthlyRent, 0),
              since: [...relevant].map((r) => r.startDate).sort()[0]!,
              active: relevant.some((r) => r.status === "active"),
              byRoom: relevant.some((r) => r.roomId != null),
              collectedThisYearCents: rooms.reduce((a, l) => a + l.collectedThisYearCents, 0),
              rooms,
            };
          })()
        : null,
    expenses: exps
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
      .map((e) => ({
        date: e.issueDate,
        category: e.category,
        concept: e.concept,
        amountCents: e.totalCents,
        fileUrl: e.fileUrl,
      })),
    expensesByCategory: [...byCategory.entries()]
      .map(([category, totalCents]) => ({ category, totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents),
    visits: {
      upcoming: vs
        .filter(
          (v) =>
            v.scheduledAt.getTime() >= now &&
            (v.status === "requested" || v.status === "confirmed"),
        )
        .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
        .map((v) => ({ at: v.scheduledAt.toISOString(), status: v.status })),
      past: vs
        .filter((v) => v.scheduledAt.getTime() < now || v.status === "done" || v.status === "cancelled")
        .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
        .slice(0, 24)
        .map((v) => ({ at: v.scheduledAt.toISOString(), status: v.status })),
    },
    monthly,
    settlement: (await isOwnerSettlementVisible(prop.id))
      ? await getPropertySettlement(prop.id)
      : null,
  };
}
