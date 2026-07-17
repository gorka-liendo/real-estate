import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

// Etapa del cliente en el pipeline (CRM básico).
export const clientStage = pgEnum("client_stage", ["lead", "active", "closed"]);
export type ClientStage = (typeof clientStage.enumValues)[number];

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Client = typeof clients.$inferSelect;
