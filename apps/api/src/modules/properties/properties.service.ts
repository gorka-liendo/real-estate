import { and, eq } from "drizzle-orm";
import { properties, tenantDb, type Property } from "@rep/db";
import type { CreatePropertyInput, UpdatePropertyInput } from "./properties.schema.js";

// Lógica de propiedades — SIEMPRE vía tenantDb() (aislamiento por tenant).
// Los `.returning()` scoped devuelven filas sin tipar → cast a Property.

export async function listProperties(): Promise<Property[]> {
  const rows = await tenantDb().select(properties);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// Solo las publicadas — para el micrositio público. Usa el tenant del contexto
// (lo pone tenantMiddleware), así que funciona también en rutas públicas.
export async function listPublishedProperties(): Promise<Property[]> {
  const rows = await tenantDb().select(properties, eq(properties.status, "published"));
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

async function getProperty(id: string): Promise<Property | null> {
  const [row] = await tenantDb().select(properties, eq(properties.id, id));
  return row ?? null;
}

export async function addPhoto(id: string, url: string): Promise<Property | null> {
  const p = await getProperty(id);
  if (!p) return null;
  const photos = [...(p.photos ?? []), url];
  const rows = (await tenantDb()
    .update(properties, { photos }, eq(properties.id, id))
    .returning()) as Property[];
  return rows[0] ?? null;
}

export async function removePhoto(id: string, url: string): Promise<Property | null> {
  const p = await getProperty(id);
  if (!p) return null;
  const photos = (p.photos ?? []).filter((u) => u !== url);
  const rows = (await tenantDb()
    .update(properties, { photos }, eq(properties.id, id))
    .returning()) as Property[];
  return rows[0] ?? null;
}

/** Propiedad publicada por id — para la ficha pública del micrositio. */
export async function getPublishedProperty(id: string): Promise<Property | null> {
  const [row] = await tenantDb().select(
    properties,
    and(eq(properties.id, id), eq(properties.status, "published")),
  );
  return row ?? null;
}
