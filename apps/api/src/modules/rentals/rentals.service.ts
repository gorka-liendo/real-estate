import { and, eq, inArray } from "drizzle-orm";
import {
  clients,
  properties,
  propertyRooms,
  rentalPayments,
  rentals,
  tenantDb,
  type PropertyRoom,
  type Rental,
  type RentalPayment,
} from "@rep/db";
import type { CreateRentalInput, PaymentInput, UpdateRentalInput } from "./rentals.schema.js";

// Alquileres: contratos + cobros mensuales. Todo vía tenantDb (aislamiento).

const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

export type RentalWithPayments = Rental & { payments: RentalPayment[]; roomName: string | null };

export async function listRentals(): Promise<RentalWithPayments[]> {
  const rows = (await tenantDb().select(rentals)) as Rental[];
  if (rows.length === 0) return [];
  const pays = (await tenantDb().select(
    rentalPayments,
    inArray(rentalPayments.rentalId, rows.map((r) => r.id)),
  )) as RentalPayment[];
  const roomIds = rows.map((r) => r.roomId).filter(Boolean) as string[];
  const rooms = roomIds.length
    ? ((await tenantDb().select(propertyRooms, inArray(propertyRooms.id, roomIds))) as PropertyRoom[])
    : [];
  return rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      ...r,
      roomName: r.roomId ? (rooms.find((x) => x.id === r.roomId)?.name ?? null) : null,
      payments: pays
        .filter((p) => p.rentalId === r.id)
        .sort((a, b) => b.period.localeCompare(a.period)),
    }));
}

type ClientRef = { id: string; name: string; email: string | null; phone: string | null };
export type RentalDetail = {
  rental: Rental;
  payments: RentalPayment[];
  property: {
    id: string;
    title: string;
    city: string | null;
    ownerClientId: string | null;
  } | null;
  room: { id: string; name: string } | null; // habitación (si el contrato es por habitación)
  tenant: ClientRef | null; // inquilino (cliente del CRM vinculado)
  owner: ClientRef | null; // propietario del inmueble (owner_client del piso)
};

/** Detalle completo de un contrato: cobros, inmueble y clientes (inquilino +
 *  propietario) para la página de gestión. */
export async function getRentalDetail(id: string): Promise<RentalDetail | null> {
  const rentalRows = (await tenantDb().select(rentals, eq(rentals.id, id))) as Rental[];
  const rental = rentalRows[0];
  if (!rental) return null;

  const payments = (
    (await tenantDb().select(rentalPayments, eq(rentalPayments.rentalId, id))) as RentalPayment[]
  ).sort((a, b) => a.period.localeCompare(b.period));

  const propRows = await tenantDb().select(properties, eq(properties.id, rental.propertyId));
  const prop = propRows[0];
  const property = prop
    ? { id: prop.id, title: prop.title, city: prop.city, ownerClientId: prop.ownerClientId }
    : null;

  const clientIds = [rental.renterClientId, prop?.ownerClientId].filter(Boolean) as string[];
  const clientRows = clientIds.length
    ? await tenantDb().select(clients, inArray(clients.id, clientIds))
    : [];
  const ref = (cid: string | null | undefined): ClientRef | null => {
    const c = cid ? clientRows.find((x) => x.id === cid) : null;
    return c ? { id: c.id, name: c.name, email: c.email, phone: c.phone } : null;
  };

  let room: RentalDetail["room"] = null;
  if (rental.roomId) {
    const roomRows = (await tenantDb().select(
      propertyRooms,
      eq(propertyRooms.id, rental.roomId),
    )) as PropertyRoom[];
    if (roomRows[0]) room = { id: roomRows[0].id, name: roomRows[0].name };
  }

  return {
    rental,
    payments,
    property,
    room,
    tenant: ref(rental.renterClientId),
    owner: ref(prop?.ownerClientId),
  };
}

export type CreateRentalResult =
  | { ok: true; rental: Rental }
  | {
      ok: false;
      error:
        | "property_not_found"
        | "invalid_renter"
        | "invalid_room"
        | "active_rental_exists" // ya hay un contrato de piso entero activo
        | "room_occupied"; // esa habitación ya tiene contrato activo
    };

export async function createRental(input: CreateRentalInput): Promise<CreateRentalResult> {
  const prop = await tenantDb().select(properties, eq(properties.id, input.propertyId));
  if (prop.length === 0) return { ok: false, error: "property_not_found" };

  if (input.renterClientId) {
    const renter = await tenantDb().select(clients, eq(clients.id, input.renterClientId));
    if (renter.length === 0) return { ok: false, error: "invalid_renter" };
  }

  // La habitación (si la hay) debe existir y pertenecer a ESTE inmueble.
  if (input.roomId) {
    const room = (await tenantDb().select(
      propertyRooms,
      eq(propertyRooms.id, input.roomId),
    )) as PropertyRoom[];
    if (room.length === 0 || room[0]!.propertyId !== input.propertyId) {
      return { ok: false, error: "invalid_room" };
    }
  }

  // Contratos activos del inmueble. Reglas de convivencia:
  //  - Piso entero (sin habitación): incompatible con CUALQUIER contrato activo.
  //  - Por habitación: incompatible con un contrato de piso entero activo, y
  //    con otro contrato activo de la MISMA habitación.
  const active = (await tenantDb().select(
    rentals,
    and(eq(rentals.propertyId, input.propertyId), eq(rentals.status, "active")),
  )) as Rental[];

  if (!input.roomId) {
    if (active.length > 0) return { ok: false, error: "active_rental_exists" };
  } else {
    if (active.some((r) => r.roomId == null)) return { ok: false, error: "active_rental_exists" };
    if (active.some((r) => r.roomId === input.roomId)) return { ok: false, error: "room_occupied" };
  }

  const rows = (await tenantDb()
    .insert(rentals, {
      propertyId: input.propertyId,
      roomId: input.roomId ?? null,
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
