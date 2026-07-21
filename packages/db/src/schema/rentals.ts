import {
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./clients.js";
import { properties } from "./properties.js";
import { tenants } from "./tenants.js";

// Habitación de un inmueble: permite alquilar un piso por habitaciones a varios
// inquilinos a la vez (cada habitación = su propio contrato). Un contrato con
// roomId=NULL alquila el PISO ENTERO.
// TENANT-SCOPED → acceso solo vía tenantDb()/forTenant().
export const propertyRooms = pgTable("property_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // "Habitación 1", "Suite", …
  areaM2: integer("area_m2"), // m² (opcional)
  refPrice: integer("ref_price"), // precio de referencia €/mes (opcional)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PropertyRoom = typeof propertyRooms.$inferSelect;

// Contrato de alquiler de un inmueble, gestionado por la agencia.
export const rentalStatus = pgEnum("rental_status", ["active", "ended"]);
export type RentalStatus = (typeof rentalStatus.enumValues)[number];

// TENANT-SCOPED → acceso solo vía tenantDb()/forTenant().
export const rentals = pgTable("rentals", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  // Habitación alquilada (NULL = piso entero). Si se borra la habitación, el
  // contrato pasa a "piso entero" (histórico preservado).
  roomId: uuid("room_id").references(() => propertyRooms.id, { onDelete: "set null" }),
  // Inquilino: cliente del CRM opcional + snapshot del nombre (el contrato
  // sobrevive si el cliente se borra).
  renterClientId: uuid("renter_client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  renterName: text("renter_name").notNull(),
  monthlyRent: integer("monthly_rent").notNull(), // euros/mes
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  status: rentalStatus("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Rental = typeof rentals.$inferSelect;

// Cobro mensual de un contrato. Un registro por mes (period = día 1 del mes).
export const paymentStatus = pgEnum("rental_payment_status", ["pending", "paid"]);
export type RentalPaymentStatus = (typeof paymentStatus.enumValues)[number];

export const rentalPayments = pgTable(
  "rental_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    period: date("period").notNull(), // primer día del mes (2026-07-01)
    amount: integer("amount").notNull(), // euros
    status: paymentStatus("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("rental_payments_rental_period").on(t.rentalId, t.period)],
);

export type RentalPayment = typeof rentalPayments.$inferSelect;
