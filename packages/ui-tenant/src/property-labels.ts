// Labels de presentación de propiedades — FUENTE ÚNICA para los frontends
// (tenant-site y componentes del DS). Antes había 5 copias del mapa de tipos;
// la API y el dashboard mantienen la suya server-side/app-side (anotado en
// CLAUDE.md como deuda si algún día compensa un paquete leaf compartido).
export const PROPERTY_KIND_LABELS = {
  flat: "Piso",
  house: "Casa",
  commercial: "Local",
  land: "Terreno",
  garage: "Garaje",
} as const;

export type PropertyKindId = keyof typeof PROPERTY_KIND_LABELS;

export const PROPERTY_KIND_OPTIONS = (
  Object.entries(PROPERTY_KIND_LABELS) as [PropertyKindId, string][]
).map(([value, label]) => ({ value, label }));

export const OPERATION_LABELS = {
  sale: "En venta",
  rent: "En alquiler",
} as const;

export type OperationId = keyof typeof OPERATION_LABELS;
