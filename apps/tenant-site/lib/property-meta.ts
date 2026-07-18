// Metadatos de propiedad (etiquetas ES) para el micrositio, inspirados en Idealista.
// Duplicado intencional del dashboard: @rep/db exporta el cliente pg y no puede
// bundlearse en el micrositio, así que las etiquetas viven en cada app.

export const FEATURE_LABELS: Record<string, string> = {
  elevator: "Ascensor",
  terrace: "Terraza",
  balcony: "Balcón",
  air_conditioning: "Aire acondicionado",
  heating: "Calefacción",
  garage: "Garaje",
  storage: "Trastero",
  pool: "Piscina",
  garden: "Jardín",
  built_in_wardrobes: "Armarios empotrados",
  equipped_kitchen: "Cocina equipada",
  sea_views: "Vistas al mar",
  accessible: "Accesible",
  green_areas: "Zonas verdes",
};

export const CONDITION_LABELS: Record<string, string> = {
  new: "Obra nueva",
  good: "Buen estado",
  renew: "A reformar",
};

// Fuente única en el DS (@rep/ui-tenant); re-export para los consumidores locales.
export { PROPERTY_KIND_LABELS as KIND_LABELS } from "@rep/ui-tenant";

export function featureLabel(id: string): string {
  return FEATURE_LABELS[id] ?? id;
}
