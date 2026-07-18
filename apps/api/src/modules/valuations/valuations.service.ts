import { and, eq } from "drizzle-orm";
import { clients, properties, tenantDb, type Client } from "@rep/db";
import type { CreateValuationInput } from "./valuations.schema.js";

// Estimación transparente a partir de la cartera del PROPIO tenant: €/m² medio
// de sus inmuebles publicados en venta (mismo tipo; misma ciudad si hay
// comparables allí). Sin datos de mercado externos todavía — si no hay
// comparables, no se inventa cifra: estimate = null y la agencia responde.
export type Estimate = {
  low: number;
  high: number;
  pricePerM2: number;
  comparables: number;
};

const KIND_LABEL: Record<CreateValuationInput["kind"], string> = {
  flat: "Piso",
  house: "Casa",
  commercial: "Local",
  land: "Terreno",
  garage: "Garaje",
};

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export async function estimateValue(input: CreateValuationInput): Promise<Estimate | null> {
  // Comparables: publicados, en venta, mismo tipo, con precio y superficie.
  const rows = await tenantDb().select(
    properties,
    and(
      eq(properties.status, "published"),
      eq(properties.operation, "sale"),
      eq(properties.kind, input.kind),
    ),
  );
  // price > 0: los inmuebles "a consultar" (precio 0) no son comparables y
  // arrastrarían la media €/m² hacia abajo.
  const usable = rows.filter(
    (p) => p.price != null && p.price > 0 && p.areaM2 != null && p.areaM2 > 0,
  );
  if (usable.length === 0) return null;

  // Si hay comparables en la misma ciudad, restringimos a ellos.
  const city = input.city?.trim().toLowerCase();
  const inCity = city
    ? usable.filter((p) => p.city?.trim().toLowerCase() === city)
    : [];
  const sample = inCity.length > 0 ? inCity : usable;

  const pricePerM2 =
    sample.reduce((acc, p) => acc + p.price! / p.areaM2!, 0) / sample.length;
  const mid = pricePerM2 * input.areaM2;

  const estimate = {
    low: roundTo(mid * 0.9, 1000),
    high: roundTo(mid * 1.1, 1000),
    pricePerM2: Math.round(pricePerM2),
    comparables: sample.length,
  };
  // Estimaciones degeneradas (mid tan bajo que redondea a 0) → mejor no dar
  // cifra que enseñar "0 – 0 €": cae al camino de valoración manual.
  if (estimate.low <= 0) return null;
  return estimate;
}

// El propietario que pide valoración es un lead source 'valuation'; los datos
// del inmueble y la horquilla quedan en notes para el CRM.
export async function createValuationLead(
  input: Omit<CreateValuationInput, "company">,
  estimate: Estimate | null,
): Promise<Client> {
  const parts = [
    `Valoración solicitada: ${KIND_LABEL[input.kind]} · ${input.areaM2} m²`,
    input.bedrooms != null ? `${input.bedrooms} hab.` : null,
    [input.address, input.city].filter(Boolean).join(", ") || null,
    estimate
      ? `Estimación mostrada: ${estimate.low.toLocaleString("es-ES")}–${estimate.high.toLocaleString("es-ES")} € (${estimate.comparables} comparables, ${estimate.pricePerM2.toLocaleString("es-ES")} €/m²)`
      : "Sin comparables en cartera: pendiente de valoración manual",
  ].filter(Boolean);

  const rows = (await tenantDb()
    .insert(clients, {
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      stage: "lead",
      source: "valuation",
      interestPropertyId: null,
      notes: parts.join(" · "),
    })
    .returning()) as Client[];
  return rows[0]!;
}
