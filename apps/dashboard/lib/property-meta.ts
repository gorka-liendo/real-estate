// Metadatos de propiedad (etiquetas ES), inspirados en Idealista.
export const PROPERTY_FEATURES: { id: string; label: string }[] = [
  { id: "elevator", label: "Ascensor" },
  { id: "terrace", label: "Terraza" },
  { id: "balcony", label: "Balcón" },
  { id: "air_conditioning", label: "Aire acondicionado" },
  { id: "heating", label: "Calefacción" },
  { id: "garage", label: "Garaje" },
  { id: "storage", label: "Trastero" },
  { id: "pool", label: "Piscina" },
  { id: "garden", label: "Jardín" },
  { id: "built_in_wardrobes", label: "Armarios empotrados" },
  { id: "equipped_kitchen", label: "Cocina equipada" },
  { id: "sea_views", label: "Vistas al mar" },
  { id: "accessible", label: "Accesible" },
  { id: "green_areas", label: "Zonas verdes" },
];

export const SUBTYPES = [
  "Apartamento",
  "Ático",
  "Dúplex",
  "Estudio",
  "Loft",
  "Chalet",
  "Adosado",
  "Pareado",
  "Casa rural",
];

export const CONDITIONS: { id: string; label: string }[] = [
  { id: "new", label: "Obra nueva" },
  { id: "good", label: "Buen estado" },
  { id: "renew", label: "A reformar" },
];
