import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Property = typeof properties.$inferSelect;
