import { eq } from "drizzle-orm";
import { properties, tenantDb, type Property } from "@rep/db";
import type { CreatePropertyInput, UpdatePropertyInput } from "./properties.schema.js";

// Lógica de propiedades — SIEMPRE vía tenantDb() (aislamiento por tenant).
// Los `.returning()` scoped devuelven filas sin tipar → cast a Property.

export async function listProperties(): Promise<Property[]> {
  const rows = await tenantDb().select(properties);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function createProperty(input: CreatePropertyInput): Promise<Property> {
  const rows = (await tenantDb().insert(properties, input).returning()) as Property[];
  return rows[0]!;
}

export async function updateProperty(
  id: string,
  input: UpdatePropertyInput,
): Promise<Property | null> {
  const rows = (await tenantDb()
    .update(properties, input, eq(properties.id, id))
    .returning()) as Property[];
  return rows[0] ?? null;
}

export async function deleteProperty(id: string): Promise<boolean> {
  const rows = (await tenantDb()
    .delete(properties, eq(properties.id, id))
    .returning()) as Property[];
  return rows.length > 0;
}
