import { date, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { properties } from "./properties.js";
import { tenants } from "./tenants.js";

// Gasto compartido de un piso alquilado POR HABITACIONES (luz, agua, gas…) que se
// reparte entre los inquilinos proporcional a los días que su estancia solapa con
// el PERIODO de la factura (inicio→fin) — igual que el Excel del cliente. El reparto
// NO se persiste: se calcula al vuelo desde los contratos (rentals), así si se
// corrige una fecha de entrada/salida se recalcula solo.
// Tipos abiertos para poder meter facturas nuevas de cualquier tipo; cada tipo se
// agrupa por separado en la liquidación (como columnas del Excel).
export const sharedExpenseType = pgEnum("shared_expense_type", [
  "electricity", // Luz
  "water", // Agua
  "gas", // Gas
  "internet", // Internet
  "community", // Comunidad
  "heating", // Calefacción
  "other", // Otros (usa `concept` para nombrarla)
]);
export type SharedExpenseType = (typeof sharedExpenseType.enumValues)[number];

// TENANT-SCOPED → acceso solo vía tenantDb()/forTenant().
export const sharedExpenses = pgTable("shared_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  type: sharedExpenseType("type").notNull().default("electricity"),
  concept: text("concept"), // "Iberdrola enero", opcional
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  amountCents: integer("amount_cents").notNull(), // importe total de la factura
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type SharedExpense = typeof sharedExpenses.$inferSelect;
