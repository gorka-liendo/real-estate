import { date, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { clients } from "./clients.js";
import { properties } from "./properties.js";
import { propertyRooms, rentals } from "./rentals.js";
import { tenants } from "./tenants.js";

// Contabilidad: un documento con DIRECCIÓN — gasto que la agencia paga
// (expense, absorbe lo que antes era property_expenses) o factura que la
// agencia emite (income: honorarios, comisiones, cuotas de gestión). Puede
// colgar de un inmueble, de un cliente, de ambos o de ninguno — a propósito:
// no todo gasto es de un piso (una suscripción, el alquiler de la oficina…).
export const invoiceDirection = pgEnum("invoice_direction", ["expense", "income"]);
export type InvoiceDirection = (typeof invoiceDirection.enumValues)[number];

// draft: factura emitida aún sin finalizar (solo income, antes de numerar).
// pending: pendiente de pago (gasto recibido sin pagar, o factura ya enviada).
// paid: saldada (suma de invoice_payments >= total). cancelled: anulada.
// 'overdue' NO se persiste — se deriva en la API comparando due_date con hoy,
// para no depender de un job que mantenga el estado al día.
export const invoiceStatus = pgEnum("invoice_status", ["draft", "pending", "paid", "cancelled"]);
export type InvoiceStatus = (typeof invoiceStatus.enumValues)[number];

// Categorías de gasto (heredadas 1:1 de property_expenses) + las propias de
// facturación a clientes (management_fee, commission).
export const invoiceCategory = pgEnum("invoice_category", [
  "water",
  "electricity",
  "gas",
  "community",
  "taxes",
  "derrama",
  "maintenance",
  "insurance",
  "management_fee", // honorarios de gestión (income)
  "commission", // comisión de venta/alquiler (income)
  "other",
]);
export type InvoiceCategory = (typeof invoiceCategory.enumValues)[number];

export const invoicePaymentMethod = pgEnum("invoice_payment_method", [
  "transfer",
  "cash",
  "card",
  "other",
]);
export type InvoicePaymentMethod = (typeof invoicePaymentMethod.enumValues)[number];

// TENANT-SCOPED → acceso solo vía tenantDb()/forTenant().
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    direction: invoiceDirection("direction").notNull(),
    status: invoiceStatus("status").notNull().default("pending"),
    // Todas nullable a propósito: una factura puede no pertenecer a ningún
    // piso ni cliente concreto (gasto general de la agencia).
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    // Habitación concreta del inmueble (contabilidad por habitación); NULL = todo
    // el inmueble o gasto/factura no imputado a una habitación.
    roomId: uuid("room_id").references(() => propertyRooms.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    rentalId: uuid("rental_id").references(() => rentals.id, { onDelete: "set null" }),
    // Proveedor en texto libre cuando el gasto no viene de un cliente del CRM
    // (p. ej. "Iberdrola"). Snapshot: no depende de ninguna fila.
    vendorName: text("vendor_name"),
    category: invoiceCategory("category").notNull().default("other"),
    // Numeración correlativa (solo income, al emitir — p. ej. "2026-0007").
    number: text("number"),
    concept: text("concept"),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),
    // Dinero en céntimos en todo el módulo (las facturas llevan decimales e
    // IVA — rentals/rental_payments se quedan en euros enteros, no es objeto
    // de esta migración). tax_rate_bps en puntos básicos: 2100 = 21,00%.
    subtotalCents: integer("subtotal_cents").notNull(),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    // Documento: el PDF/foto subida (gasto), o el PDF que generamos nosotros
    // al emitir (income) — mismo par de columnas, un solo concepto de adjunto.
    fileUrl: text("file_url"),
    fileName: text("file_name"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // NULL no choca consigo mismo en un UNIQUE de Postgres → válido tener
  // muchas facturas de gasto con number=NULL y aun así numeración única.
  (t) => [unique("invoices_tenant_number").on(t.tenantId, t.number)],
);

export type Invoice = typeof invoices.$inferSelect;

// Pagos de una factura — permite pagos parciales (p. ej. una comisión
// cobrada en dos plazos). Independiente de rental_payments (ese es
// específico de la renta mensual de un contrato de alquiler).
export const invoicePayments = pgTable("invoice_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  method: invoicePaymentMethod("method").notNull().default("transfer"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InvoicePayment = typeof invoicePayments.$inferSelect;
