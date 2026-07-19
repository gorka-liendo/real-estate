import { and, eq, inArray } from "drizzle-orm";
import {
  clients,
  properties,
  rentalPayments,
  rentals,
  tenantDb,
  type Rental,
  type RentalPayment,
} from "@rep/db";
import type { CreateRentalInput, PaymentInput, UpdateRentalInput } from "./rentals.schema.js";

// Alquileres: contratos + cobros mensuales. Todo vía tenantDb (aislamiento).

const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

export type RentalWithPayments = Rental & { payments: RentalPayment[] };

export async function listRentals(): Promise<RentalWithPayments[]> {
  const rows = (await tenantDb().select(rentals)) as Rental[];
  if (rows.length === 0) return [];
  const pays = (await tenantDb().select(
    rentalPayments,
    inArray(rentalPayments.rentalId, rows.map((r) => r.id)),
  )) as RentalPayment[];
  return rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      ...r,
      payments: pays
        .filter((p) => p.rentalId === r.id)
        .sort((a, b) => b.period.localeCompare(a.period)),
    }));
}

export type CreateRentalResult =
  | { ok: true; rental: Rental }
  | { ok: false; error: "property_not_found" | "invalid_renter" | "active_rental_exists" };

export async function createRental(input: CreateRentalInput): Promise<CreateRentalResult> {
  const prop = await tenantDb().select(properties, eq(properties.id, input.propertyId));
  if (prop.length === 0) return { ok: false, error: "property_not_found" };

  if (input.renterClientId) {
    const renter = await tenantDb().select(clients, eq(clients.id, input.renterClientId));
    if (renter.length === 0) return { ok: false, error: "invalid_renter" };
  }

  // Un inmueble solo puede tener UN contrato activo a la vez.
  const active = await tenantDb().select(
    rentals,
    and(eq(rentals.propertyId, input.propertyId), eq(rentals.status, "active")),
  );
  if (active.length > 0) return { ok: false, error: "active_rental_exists" };

  const rows = (await tenantDb()
    .insert(rentals, {
      propertyId: input.propertyId,
      renterClientId: input.renterClientId ?? null,
      renterName: input.renterName,
      monthlyRent: input.monthlyRent,
      startDate: toDateOnly(input.startDate),
      notes: input.notes ?? null,
    })
    .returning()) as Rental[];
  return { ok: true, rental: rows[0]! };
}

export async function updateRental(
  id: string,
  input: UpdateRentalInput,
): Promise<Rental | null> {
  const patch: Record<string, unknown> = { ...input };
  if (input.endDate !== undefined) {
    patch.endDate = input.endDate ? toDateOnly(input.endDate) : null;
  }
  // Finalizar sin fecha explícita → hoy.
  if (input.status === "ended" && input.endDate === undefined) {
    patch.endDate = toDateOnly(new Date());
  }
  const rows = (await tenantDb()
    .update(rentals, patch, eq(rentals.id, id))
    .returning()) as Rental[];
  return rows[0] ?? null;
}

/** Upsert del cobro de un mes (period = "YYYY-MM"). */
export async function upsertPayment(
  rentalId: string,
  period: string,
  input: PaymentInput,
): Promise<RentalPayment | null> {
  const rentalRows = (await tenantDb().select(rentals, eq(rentals.id, rentalId))) as Rental[];
  const rental = rentalRows[0];
  if (!rental) return null;

  const periodDate = `${period}-01`;
  const values = {
    amount: input.amount ?? rental.monthlyRent,
    status: input.status,
    paidAt: input.status === "paid" ? new Date() : null,
    notes: input.notes ?? null,
  };

  const existing = (await tenantDb().select(
    rentalPayments,
    and(eq(rentalPayments.rentalId, rentalId), eq(rentalPayments.period, periodDate)),
  )) as RentalPayment[];

  if (existing[0]) {
    const rows = (await tenantDb()
      .update(rentalPayments, values, eq(rentalPayments.id, existing[0].id))
      .returning()) as RentalPayment[];
    return rows[0]!;
  }
  const rows = (await tenantDb()
    .insert(rentalPayments, { rentalId, period: periodDate, ...values })
    .returning()) as RentalPayment[];
  return rows[0]!;
}
