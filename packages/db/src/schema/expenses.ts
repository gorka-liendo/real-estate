import { date, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { properties } from "./properties.js";
import { tenants } from "./tenants.js";

// Categoría del gasto de un inmueble (facturas que gestiona la agencia).
export const expenseCategory = pgEnum("expense_category", [
  "water", // agua
  "electricity", // luz
  "gas",
  "community", // comunidad
  "taxes", // impuestos (IBI…)
  "derrama",
  "maintenance", // mantenimiento/reparaciones
  "insurance", // seguro
  "other",
]);
export type ExpenseCategory = (typeof expenseCategory.enumValues)[number];

// Gastos por inmueble. TENANT-SCOPED. El importe va en CÉNTIMOS (las facturas
// de suministros llevan decimales; price/monthlyRent siguen en euros enteros
// porque son cifras redondas de mercado).
export const propertyExpenses = pgTable("property_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  category: expenseCategory("category").notNull(),
  concept: text("concept"), // "Factura Iberdrola mayo", "Derrama ascensor"…
  amountCents: integer("amount_cents").notNull(),
  expenseDate: date("expense_date").notNull(),
  // Factura adjunta (subida a @rep/storage). Nullable: gasto sin documento.
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PropertyExpense = typeof propertyExpenses.$inferSelect;
