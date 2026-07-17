import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const tenantStatus = pgEnum("tenant_status", ["active", "suspended"]);

/**
 * brand_config: la "piel" white-label del tenant (Capa 2 del design system).
 * Los defaults son los tokens del estilo base Dwell — un tenant sin config se ve Dwell.
 */
export type BrandConfig = {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  background?: string;
  textPrimary?: string;
  textSecondary?: string;
  logoUrl?: string;
  faviconUrl?: string;
  fontDisplay?: string;
  fontBody?: string;
  borderRadius?: 0 | 4 | 8 | 16;
  micrositeStyle?: "editorial" | "minimal" | "bold";
};

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(), // subdominio: <slug>.plataforma.app
  name: text("name").notNull(),
  customDomain: text("custom_domain").unique(),
  brandConfig: jsonb("brand_config").$type<BrandConfig>().notNull().default({}),
  status: tenantStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
