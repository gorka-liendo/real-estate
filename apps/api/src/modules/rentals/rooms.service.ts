import { and, eq } from "drizzle-orm";
import { properties, propertyRooms, rentals, tenantDb, type PropertyRoom } from "@rep/db";
import type { CreateRoomInput, UpdateRoomInput } from "./rooms.schema.js";

// Habitaciones de un inmueble. Todo vía tenantDb (aislamiento).

export async function listRooms(propertyId: string): Promise<PropertyRoom[]> {
  const rows = (await tenantDb().select(
    propertyRooms,
    eq(propertyRooms.propertyId, propertyId),
  )) as PropertyRoom[];
  return rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export type CreateRoomResult =
  | { ok: true; room: PropertyRoom }
  | { ok: false; error: "property_not_found" };

export async function createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
  const prop = await tenantDb().select(properties, eq(properties.id, input.propertyId));
  if (prop.length === 0) return { ok: false, error: "property_not_found" };

  const rows = (await tenantDb()
    .insert(propertyRooms, {
      propertyId: input.propertyId,
      name: input.name,
      areaM2: input.areaM2 ?? null,
      refPrice: input.refPrice ?? null,
    })
    .returning()) as PropertyRoom[];
  return { ok: true, room: rows[0]! };
}

export async function updateRoom(id: string, input: UpdateRoomInput): Promise<PropertyRoom | null> {
  const rows = (await tenantDb()
    .update(propertyRooms, { ...input }, eq(propertyRooms.id, id))
    .returning()) as PropertyRoom[];
  return rows[0] ?? null;
}

export type DeleteRoomResult = { ok: true } | { ok: false; error: "not_found" | "room_occupied" };

export async function deleteRoom(id: string): Promise<DeleteRoomResult> {
  const rows = (await tenantDb().select(propertyRooms, eq(propertyRooms.id, id))) as PropertyRoom[];
  if (rows.length === 0) return { ok: false, error: "not_found" };

  // No borrar una habitación con contrato activo (dejaría el contrato huérfano).
  const active = await tenantDb().select(
    rentals,
    and(eq(rentals.roomId, id), eq(rentals.status, "active")),
  );
  if (active.length > 0) return { ok: false, error: "room_occupied" };

  await tenantDb().delete(propertyRooms, eq(propertyRooms.id, id));
  return { ok: true };
}
