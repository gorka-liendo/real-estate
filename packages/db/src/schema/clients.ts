import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

// Etapa del cliente en el pipeline (CRM básico).
export const clientStage = pgEnum("client_stage", ["lead", "active", "closed"]);
export type ClientStage = (typeof clientStage.enumValues)[number];

// Origen del cliente: alta manual en el dashboard, lead entrante del micrositio
// (form de contacto) o propietario captado por el widget de valoración.
export const clientSource = pgEnum("client_source", ["manual", "microsite", "valuation"]);
export type ClientSource = (typeof clientSource.enumValues)[number];

// Clientes de una inmobiliaria. TENANT-SCOPED (lleva tenant_id) → todo acceso
// pasa por forTenant()/tenantDb() del scoping de @rep/db.
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  stage: clientStage("stage").notNull().default("lead"),
  notes: text("notes"),
  // Captación: de dónde vino el cliente y, si es un lead del micrositio, qué
  // inmueble miraba (nullable — no referenciamos properties para no acoplar el
  // borrado del inmueble al del lead; guardamos el id como contexto).
  source: clientSource("source").notNull().default("manual"),
  interestPropertyId: uuid("interest_property_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Client = typeof clients.$inferSelect;
