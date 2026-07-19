import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clients } from "./clients.js";
import { tenants } from "./tenants.js";

export const propertyOperation = pgEnum("property_operation", ["sale", "rent"]);
export const propertyKind = pgEnum("property_kind", [
  "flat",
  "house",
  "commercial",
  "land",
  "garage",
]);
export const propertyStatus = pgEnum("property_status", ["draft", "published", "archived"]);

export type PropertyOperation = (typeof propertyOperation.enumValues)[number];
export type PropertyKind = (typeof propertyKind.enumValues)[number];
export type PropertyStatus = (typeof propertyStatus.enumValues)[number];

// Amenidades (features[]) — ids de PROPERTY_FEATURES. Inspirado en Idealista.
export type PropertyCondition = "new" | "good" | "renew";

// Detalles extensibles (jsonb) — el resto de la ficha estilo Idealista.
export type PropertyDetails = {
  reference?: string;
  subtype?: string; // apartamento, ático, dúplex, estudio, chalet, adosado…
  condition?: PropertyCondition;
  floor?: string; // planta (bajo, 1, 2, ático…)
  exterior?: boolean;
  furnished?: boolean;
  equippedKitchen?: boolean;
  energyCert?: string; // A–G
  yearBuilt?: number;
  usableM2?: number;
  province?: string;
  neighborhood?: string;
  latitude?: number;
  longitude?: number;
};

// Propiedades de una inmobiliaria. TENANT-SCOPED → acceso solo vía tenantDb().
// (Alimentará el micrositio público cuando se conecte.)
export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  operation: propertyOperation("operation").notNull().default("sale"),
  kind: propertyKind("kind").notNull().default("flat"),
  status: propertyStatus("status").notNull().default("draft"),
  price: integer("price"), // euros
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  areaM2: integer("area_m2"),
  city: text("city"),
  address: text("address"),
  photos: jsonb("photos").$type<string[]>().notNull().default([]), // URLs
  videos: jsonb("videos").$type<string[]>().notNull().default([]), // URLs
  features: jsonb("features").$type<string[]>().notNull().default([]), // ids de PROPERTY_FEATURES
  details: jsonb("details").$type<PropertyDetails>().notNull().default({}),
  // Propietario del inmueble (cliente del CRM). Borrar el cliente NO borra el
  // inmueble: el vínculo se anula (set null) y el portal deja de mostrarlo.
  ownerClientId: uuid("owner_client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Property = typeof properties.$inferSelect;
