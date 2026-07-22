import { date, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

// Etapa del cliente en el pipeline (CRM básico).
export const clientStage = pgEnum("client_stage", ["lead", "active", "closed"]);
export type ClientStage = (typeof clientStage.enumValues)[number];

// Origen del cliente: alta manual en el dashboard, lead entrante del micrositio
// (form de contacto) o propietario captado por el widget de valoración.
export const clientSource = pgEnum("client_source", ["manual", "microsite", "valuation"]);

// Tipo de cliente (perfil): propietario, inquilino, comprador, demandante de
// alquiler u otro. Se auto-clasifica donde es obvio (valoración → owner,
// lead/visita de ficha → buyer) y la agencia lo puede corregir.
export const clientKind = pgEnum("client_kind", [
  "owner", // propietario
  "renter", // inquilino
  "buyer", // busca comprar
  "seeker", // busca alquiler
  "other",
]);
export type ClientKind = (typeof clientKind.enumValues)[number];
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
  // Contacto ampliado (trato más personal).
  secondaryPhone: text("secondary_phone"),
  language: text("language"), // idioma preferido: "es", "en", "eu"…
  birthday: date("birthday"),
  // Datos de facturación (para emitir facturas correctas).
  company: text("company"), // empresa / razón social
  taxId: text("tax_id"), // NIF / CIF
  address: text("address"),
  // Segmentación libre (VIP, inversor, moroso…). Filtrable en el listado.
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  stage: clientStage("stage").notNull().default("lead"),
  notes: text("notes"),
  // Captación: de dónde vino el cliente y, si es un lead del micrositio, qué
  // inmueble miraba (nullable — no referenciamos properties para no acoplar el
  // borrado del inmueble al del lead; guardamos el id como contexto).
  source: clientSource("source").notNull().default("manual"),
  interestPropertyId: uuid("interest_property_id"),
  // Portal del propietario: token capability del enlace /portal/<token> que la
  // agencia genera y comparte. NULL = sin portal. Único por diseño.
  portalToken: text("portal_token").unique(),
  // Perfil: tipo de cliente + cuota mensual acordada (céntimos; NULL = sin
  // cuota manual — si es inquilino, la renta del contrato es la referencia).
  kind: clientKind("kind").notNull().default("other"),
  monthlyFeeCents: integer("monthly_fee_cents"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Client = typeof clients.$inferSelect;

// Notas del CRM sobre un cliente — historial manual de la agencia (además del
// timeline derivado de visitas/contratos/cobros que compone la API).
export const clientNotes = pgTable("client_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ClientNote = typeof clientNotes.$inferSelect;
