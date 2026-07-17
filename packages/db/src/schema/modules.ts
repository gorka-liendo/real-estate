import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// Catálogo de módulos vendibles (feature flags con billing acoplado).
export const modules = pgTable("modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // 'microsite', 'ai_descriptions', 'whatsapp_bot'…
  name: text("name").notNull(),
  priceMonthly: integer("price_monthly").notNull(), // céntimos de euro
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Módulos activos por tenant. Stripe es la fuente de verdad; esta tabla es
// una réplica que actualizan los webhooks (Fase C).
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "restrict" }),
    active: boolean("active").notNull().default(false),
    stripeSubscriptionItemId: text("stripe_subscription_item_id"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subscriptions_tenant_module_unique").on(t.tenantId, t.moduleId)],
);
