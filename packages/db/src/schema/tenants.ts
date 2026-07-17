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
  borderRadius?: number; // radio general (tarjetas, inputs); Dwell = 0
  buttonRadius?: number; // radio de botones aparte; Dwell = 999 (píldora)
  // Tema del design system (Capa 3): id de un archivo themes/<id>.css a medida.
  // La plataforma lo asigna; el micrositio pone data-theme=<theme>. Default "dwell".
  theme?: string;
  micrositeStyle?: "editorial" | "minimal" | "bold";
};

/**
 * site_config: el CONTENIDO editable del micrositio (Capa 2), separado de la marca.
 * Lo rellena el cliente (editor self-serve en el dashboard) o nosotros en onboarding
 * (modelo híbrido). La plantilla lo lee; nunca se hardcodea contenido en la página.
 */
export type SocialLink = { label: string; url: string };
export type SiteConfig = {
  template?: "editorial" | "minimal" | "bold";
  heroEyebrow?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  about?: string;
  contactEmail?: string;
  contactPhone?: string;
  social?: SocialLink[];
};

export type Tenant = typeof tenants.$inferSelect;

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(), // subdominio: <slug>.plataforma.app
  name: text("name").notNull(),
  customDomain: text("custom_domain").unique(),
  brandConfig: jsonb("brand_config").$type<BrandConfig>().notNull().default({}),
  siteConfig: jsonb("site_config").$type<SiteConfig>().notNull().default({}),
  status: tenantStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
