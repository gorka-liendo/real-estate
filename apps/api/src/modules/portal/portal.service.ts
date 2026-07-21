import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import {
  clients,
  invoices,
  properties,
  rentalPayments,
  rentals,
  tenantDb,
  visits,
  type Client,
  type Invoice,
  type InvoiceCategory,
  type Property,
  type Rental,
  type RentalPayment,
  type Visit,
} from "@rep/db";

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
// Rendimiento del alquiler (si el inmueble tiene contrato activo). Cifras y
// meses, SIN identidad del inquilino (misma política que las visitas).
export type PortalRental = {
  monthlyRent: number;
  since: string; // yyyy-mm-dd
  active: boolean; // false = contrato finalizado (pero sus cobros del año siguen contando)
  collectedThisYear: number;
  months: Array<{ period: string; status: RentalPayment["status"]; amount: number }>;
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

/** Entre dos contratos del mismo inmueble, ¿cuál mostrar? Preferimos el activo;
 *  a igualdad de estado, el más reciente por fecha de creación. */
function isMoreRelevant(candidate: Rental, current: Rental): boolean {
  const candActive = candidate.status === "active";
  const curActive = current.status === "active";
  if (candActive !== curActive) return candActive;
  return candidate.createdAt.getTime() > current.createdAt.getTime();
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

  // Contrato relevante por inmueble: el activo si existe; si no, el más reciente
  // aunque esté finalizado (sus cobros de este año siguen siendo ingresos reales).
  const rentalByProperty = new Map<string, Rental>();
  for (const r of allRentals) {
    const cur = rentalByProperty.get(r.propertyId);
    if (!cur || isMoreRelevant(r, cur)) rentalByProperty.set(r.propertyId, r);
  }
  const relevantRentals = [...rentalByProperty.values()];
  const payments =
    relevantRentals.length > 0
      ? ((await tenantDb().select(
          rentalPayments,
          inArray(rentalPayments.rentalId, relevantRentals.map((r) => r.id)),
        )) as RentalPayment[])
      : [];

  const yearPrefix = `${new Date().getFullYear()}-`;
  const toPortalRental = (propertyId: string): PortalRental | null => {
    const rental = rentalByProperty.get(propertyId);
    if (!rental) return null;
    const pays = payments.filter((p) => p.rentalId === rental.id);
    return {
      monthlyRent: rental.monthlyRent,
      since: rental.startDate,
      active: rental.status === "active",
      collectedThisYear: pays
        .filter((p) => p.status === "paid" && p.period.startsWith(yearPrefix))
        .reduce((acc, p) => acc + p.amount, 0),
      months: pays
        .sort((a, b) => b.period.localeCompare(a.period))
        .slice(0, 6)
        .map((p) => ({ period: p.period.slice(0, 7), status: p.status, amount: p.amount })),
    };
  };

  // Serie mensual (año en curso) de un inmueble: cobros pagados vs gastos.
  const monthlyFor = (propertyId: string): PortalMonthly[] => {
    const rental = rentalByProperty.get(propertyId);
    const paid = rental
      ? payments.filter(
          (p) => p.rentalId === rental.id && p.status === "paid" && p.period.startsWith(yearPrefix),
        )
      : [];
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
      // Los "meses pendientes" solo tienen sentido para contratos vigentes:
      // un contrato finalizado ya no genera cobros por reclamar.
      acc.pendingPayments += p.rental?.active
        ? p.rental.months.filter((m) => m.status === "pending").length
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
    monthlyRent: number;
    since: string;
    status: Rental["status"];
    collectedThisYearCents: number;
    payments: PortalPaymentRow[]; // registro COMPLETO, desc
  } | null;
  expenses: PortalExpense[]; // todos, desc
  expensesByCategory: Array<{ category: InvoiceCategory; totalCents: number }>;
  visits: {
    upcoming: Array<{ at: string; status: Visit["status"] }>;
    past: Array<{ at: string; status: Visit["status"] }>;
  };
  monthly: PortalMonthly[];
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

  const rental =
    propRentals.find((r) => r.status === "active") ??
    propRentals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
    null;
  const pays = rental
    ? ((await tenantDb().select(
        rentalPayments,
        eq(rentalPayments.rentalId, rental.id),
      )) as RentalPayment[])
    : [];

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
    rental: rental
      ? {
          monthlyRent: rental.monthlyRent,
          since: rental.startDate,
          status: rental.status,
          collectedThisYearCents:
            pays
              .filter((p) => p.status === "paid" && p.period.startsWith(yearPrefix))
              .reduce((a, p) => a + p.amount, 0) * 100,
          payments: pays
            .sort((a, b) => b.period.localeCompare(a.period))
            .map((p) => ({
              period: p.period.slice(0, 7),
              amount: p.amount,
              status: p.status,
              paidAt: p.paidAt ? p.paidAt.toISOString() : null,
            })),
        }
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
  };
}
