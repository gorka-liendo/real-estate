import { and, eq, gte, lt, ne, or } from "drizzle-orm";
import { clients, tenantDb, visits, type Client, type Visit } from "@rep/db";
import { getPublishedProperty } from "../properties/properties.service.js";
import type { RequestVisitInput, UpdateVisitInput } from "./visits.schema.js";

// Duración de la franja de visita (regla de dominio, no configuración de
// despliegue): dos visitas CONFIRMADAS a menos de esto chocan.
export const VISIT_SLOT_MINUTES = 30;
const SLOT_MS = VISIT_SLOT_MINUTES * 60_000;

/**
 * Solicitud pública: valida que el inmueble sea publicado DEL tenant, enlaza o
 * crea el lead en el CRM y registra la visita como 'requested'.
 * Devuelve null si el inmueble no existe/no es visible (→ 404 en la ruta).
 */
export async function requestVisit(
  input: Omit<RequestVisitInput, "company">,
): Promise<Visit | null> {
  const property = await getPublishedProperty(input.propertyId);
  if (!property) return null;

  // Reusar el cliente si ya existe por email o teléfono; si no, crear lead.
  const matchers = [
    input.email ? eq(clients.email, input.email) : null,
    input.phone ? eq(clients.phone, input.phone) : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  const existing =
    matchers.length > 0
      ? ((await tenantDb().select(clients, or(...matchers))) as Client[])
      : [];

  let clientId = existing[0]?.id ?? null;
  if (!clientId) {
    const rows = (await tenantDb()
      .insert(clients, {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        stage: "lead",
        kind: "buyer", // pidió visitar un inmueble → busca vivienda
        source: "microsite",
        interestPropertyId: property.id,
        notes: `Solicitó visita a "${property.title}"`,
      })
      .returning()) as Client[];
    clientId = rows[0]!.id;
  }

  const rows = (await tenantDb()
    .insert(visits, {
      propertyId: property.id,
      clientId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      scheduledAt: input.scheduledAt,
      status: "requested",
    })
    .returning()) as Visit[];
  return rows[0]!;
}

/** Visitas del tenant ordenadas por fecha (próximas primero). */
export async function listVisits(): Promise<Visit[]> {
  const rows = (await tenantDb().select(visits)) as Visit[];
  return rows.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/**
 * Visita CONFIRMADA que pisa la franja [t − slot, t + slot) — el choque de
 * agenda que la Agenda debe impedir. Excluye la propia visita al reprogramar.
 */
export async function findConflict(
  scheduledAt: Date,
  excludeId?: string,
): Promise<Visit | null> {
  const from = new Date(scheduledAt.getTime() - SLOT_MS + 1);
  const to = new Date(scheduledAt.getTime() + SLOT_MS);
  const rows = (await tenantDb().select(
    visits,
    and(
      eq(visits.status, "confirmed"),
      gte(visits.scheduledAt, from),
      lt(visits.scheduledAt, to),
      excludeId ? ne(visits.id, excludeId) : undefined,
    ),
  )) as Visit[];
  return rows[0] ?? null;
}

export async function updateVisit(
  id: string,
  input: UpdateVisitInput,
): Promise<Visit | null> {
  const rows = (await tenantDb()
    .update(visits, input, eq(visits.id, id))
    .returning()) as Visit[];
  return rows[0] ?? null;
}

export async function getVisit(id: string): Promise<Visit | null> {
  const rows = (await tenantDb().select(visits, eq(visits.id, id))) as Visit[];
  return rows[0] ?? null;
}

export async function deleteVisit(id: string): Promise<boolean> {
  const rows = (await tenantDb().delete(visits, eq(visits.id, id)).returning()) as Visit[];
  return rows.length > 0;
}
