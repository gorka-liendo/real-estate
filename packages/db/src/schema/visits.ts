import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { properties } from "./properties.js";
import { tenants } from "./tenants.js";

// Estado de una visita en la agenda: solicitada desde el micrositio →
// confirmada por la agencia → hecha (o cancelada en cualquier punto).
export const visitStatus = pgEnum("visit_status", [
  "requested",
  "confirmed",
  "done",
  "cancelled",
]);
export type VisitStatus = (typeof visitStatus.enumValues)[number];

// Visitas a inmuebles. TENANT-SCOPED → todo acceso vía tenantDb()/forTenant().
export const visits = pgTable("visits", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  // Lead del CRM asociado (nullable: el cliente puede borrarse sin perder la visita).
  clientId: uuid("client_id"),
  // Snapshot del solicitante (no depende de la fila de clients).
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: visitStatus("status").notNull().default("requested"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Visit = typeof visits.$inferSelect;
