import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  properties,
  propertyRooms,
  rentals,
  sharedExpenses,
  tenantDb,
  type PropertyRoom,
  type Rental,
  type SharedExpense,
  type SharedExpenseType,
} from "@rep/db";
import type { CreateSharedExpenseInput, UpdateSharedExpenseInput } from "./shared-expenses.schema.js";

// Reparto de gastos compartidos de un piso por habitaciones entre sus inquilinos,
// proporcional a los días que la estancia de cada uno solapa con el periodo de la
// factura — igual que el Excel del cliente. El reparto se calcula al vuelo.

const MS_DAY = 86_400_000;
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);

/** Días que [aStart,aEnd] solapa con [bStart,bEnd]. aEnd=null → contrato en curso. */
function overlapDays(aStart: string, aEnd: string | null, bStart: string, bEnd: string): number {
  const lo = Math.max(asDate(aStart).getTime(), asDate(bStart).getTime());
  const hiEnd = aEnd ? Math.min(asDate(aEnd).getTime(), asDate(bEnd).getTime()) : asDate(bEnd).getTime();
  return Math.max(0, Math.round((hiEnd - lo) / MS_DAY));
}

/** Reparte `amountCents` según pesos, cuadrando al céntimo (resto al mayor decimal). */
function splitCents(amountCents: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (amountCents * w) / total);
  const res = exact.map((x) => Math.floor(x));
  let remainder = amountCents - res.reduce((a, b) => a + b, 0);
  const byFrac = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; remainder > 0 && byFrac.length > 0; k++, remainder--) {
    res[byFrac[k % byFrac.length]!.i]! += 1;
  }
  return res;
}

// ---------- CRUD ----------

export async function listSharedExpenses(propertyId: string): Promise<SharedExpense[]> {
  const rows = (await tenantDb().select(
    sharedExpenses,
    eq(sharedExpenses.propertyId, propertyId),
  )) as SharedExpense[];
  return rows.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

export type CreateResult =
  | { ok: true; expense: SharedExpense }
  | { ok: false; error: "property_not_found" };

export async function createSharedExpense(input: CreateSharedExpenseInput): Promise<CreateResult> {
  const prop = await tenantDb().select(properties, eq(properties.id, input.propertyId));
  if (prop.length === 0) return { ok: false, error: "property_not_found" };

  const rows = (await tenantDb()
    .insert(sharedExpenses, {
      propertyId: input.propertyId,
      type: input.type,
      concept: input.concept ?? null,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      amountCents: Math.round(input.amount * 100),
    })
    .returning()) as SharedExpense[];
  return { ok: true, expense: rows[0]! };
}

export async function updateSharedExpense(
  id: string,
  input: UpdateSharedExpenseInput,
): Promise<SharedExpense | null> {
  const patch: Record<string, unknown> = {};
  if (input.type !== undefined) patch.type = input.type;
  if (input.concept !== undefined) patch.concept = input.concept;
  if (input.periodStart !== undefined) patch.periodStart = input.periodStart;
  if (input.periodEnd !== undefined) patch.periodEnd = input.periodEnd;
  if (input.amount !== undefined) patch.amountCents = Math.round(input.amount * 100);
  const rows = (await tenantDb()
    .update(sharedExpenses, patch, eq(sharedExpenses.id, id))
    .returning()) as SharedExpense[];
  return rows[0] ?? null;
}

export async function deleteSharedExpense(id: string): Promise<boolean> {
  const rows = (await tenantDb().select(sharedExpenses, eq(sharedExpenses.id, id))) as SharedExpense[];
  if (rows.length === 0) return false;
  await tenantDb().delete(sharedExpenses, eq(sharedExpenses.id, id));
  return true;
}

// ---------- Liquidación (reparto + totales por inquilino) ----------

export type ExpenseShare = {
  rentalId: string;
  renterName: string;
  roomName: string | null;
  days: number;
  cents: number;
};
export type ExpenseWithSplit = {
  id: string;
  type: SharedExpenseType;
  concept: string | null;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  shares: ExpenseShare[]; // uno por inquilino con días > 0
};
export type TenantLine = {
  rentalId: string;
  renterName: string;
  roomName: string | null;
  status: Rental["status"];
  monthlyRentCents: number; // renta mensual del contrato
  byType: Partial<Record<SharedExpenseType, number>>; // gastos por tipo (céntimos)
  expensesTotalCents: number; // suma de todos sus gastos compartidos
  totalCents: number; // renta + gastos = a pagar (como el TOTAL del Excel)
};
export type PropertySettlement = {
  expenses: ExpenseWithSplit[];
  tenants: TenantLine[];
  totalsByType: Partial<Record<SharedExpenseType, number>>;
};

export async function getPropertySettlement(propertyId: string): Promise<PropertySettlement> {
  // Inquilinos = contratos por habitación del piso (todos los estados, como la
  // lista de inquilinos del Excel — un ex-inquilino paga su parte de una factura
  // cuyo periodo solapa su estancia).
  const roomRentals = (await tenantDb().select(
    rentals,
    and(eq(rentals.propertyId, propertyId), isNotNull(rentals.roomId)),
  )) as Rental[];

  const roomIds = roomRentals.map((r) => r.roomId).filter(Boolean) as string[];
  const rooms = roomIds.length
    ? ((await tenantDb().select(propertyRooms, inArray(propertyRooms.id, roomIds))) as PropertyRoom[])
    : [];
  const roomName = (id: string | null) => (id ? (rooms.find((x) => x.id === id)?.name ?? null) : null);

  const expensesRaw = await listSharedExpenses(propertyId);

  // Acumuladores por inquilino.
  const line = new Map<string, TenantLine>();
  for (const r of roomRentals) {
    line.set(r.id, {
      rentalId: r.id,
      renterName: r.renterName,
      roomName: roomName(r.roomId),
      status: r.status,
      monthlyRentCents: r.monthlyRent * 100,
      byType: {},
      expensesTotalCents: 0,
      totalCents: r.monthlyRent * 100,
    });
  }

  const totalsByType: Partial<Record<SharedExpenseType, number>> = {};

  const expenses: ExpenseWithSplit[] = expensesRaw.map((e) => {
    const days = roomRentals.map((r) =>
      overlapDays(r.startDate, r.endDate, e.periodStart, e.periodEnd),
    );
    const cents = splitCents(e.amountCents, days);
    const shares: ExpenseShare[] = [];
    roomRentals.forEach((r, i) => {
      if (days[i]! <= 0) return;
      shares.push({
        rentalId: r.id,
        renterName: r.renterName,
        roomName: roomName(r.roomId),
        days: days[i]!,
        cents: cents[i]!,
      });
      const l = line.get(r.id)!;
      l.byType[e.type] = (l.byType[e.type] ?? 0) + cents[i]!;
      l.expensesTotalCents += cents[i]!;
      l.totalCents += cents[i]!;
    });
    totalsByType[e.type] = (totalsByType[e.type] ?? 0) + e.amountCents;
    return {
      id: e.id,
      type: e.type,
      concept: e.concept,
      periodStart: e.periodStart,
      periodEnd: e.periodEnd,
      amountCents: e.amountCents,
      shares,
    };
  });

  return { expenses, tenants: [...line.values()], totalsByType };
}
