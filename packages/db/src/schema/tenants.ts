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

/**
 * Secciones del micrositio (motor de secciones — Paso 1).
 * El CUERPO del micrositio (entre topbar y footer) es una lista ORDENADA y
 * ACTIVABLE de secciones. Cada sección es una unidad autocontenida: un `type`
 * (discriminante) + su contenido propio. El orden del array = orden de render.
 *
 * Dos "puertas" de visibilidad (resueltas en el render del tenant-site):
 *  - contenido: la activa/ordena el cliente self-serve (`enabled`).
 *  - producto:  además requiere un módulo contratado (p.ej. `valuation`) —
 *    aunque `enabled` sea true, no se pinta si el tenant no tiene el módulo.
 *
 * Retrocompatibilidad: un tenant SIN `sections` deriva una lista por defecto de
 * los campos planos (heroTitle, template…). Por eso los campos planos de hero se
 * conservan como fuente de la derivación. El footer/contacto NO son secciones
 * (son "chrome" permanente) y siguen leyendo los campos planos.
 */
export type SiteSectionBase = {
  id: string; // estable (React key, reordenado, edición); único dentro del array
  enabled: boolean;
  // Etiqueta en el navbar. Si tiene texto, la sección aparece en el menú
  // (enlazando a su ancla). Vacío/ausente = no aparece. `undefined` cae al
  // default del tipo (properties/valuation salen por defecto; el resto no).
  navLabel?: string;
};
export type HeroSection = SiteSectionBase & {
  type: "hero";
  template?: "editorial" | "minimal" | "bold";
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  // Media de fondo del hero (subida por el cliente a @rep/storage). Si hay
  // vídeo manda; la imagen sirve de poster/fallback. Con media → hero "cover".
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;
};
export type PropertiesSection = SiteSectionBase & {
  type: "properties";
  eyebrow?: string;
  title?: string;
};
export type ValuationSection = SiteSectionBase & {
  type: "valuation";
  eyebrow?: string;
  title?: string;
  intro?: string;
};
export type StatItem = { value: string; label: string };
export type StatsSection = SiteSectionBase & {
  type: "stats";
  eyebrow?: string;
  title?: string;
  items?: StatItem[];
};
export type TestimonialItem = { quote: string; author: string; role?: string };
export type TestimonialsSection = SiteSectionBase & {
  type: "testimonials";
  eyebrow?: string;
  title?: string;
  items?: TestimonialItem[];
};
export type FaqItem = { question: string; answer: string };
export type FaqSection = SiteSectionBase & {
  type: "faq";
  eyebrow?: string;
  title?: string;
  items?: FaqItem[];
};
// Imagen + texto en dos columnas. El LADO de la imagen se alterna solo según la
// posición de la sección (automático). Layout editorial que rompe la planitud.
export type SplitSection = SiteSectionBase & {
  type: "split";
  eyebrow?: string;
  title?: string;
  body?: string;
  imageUrl?: string;
};
export type SiteSection =
  | HeroSection
  | PropertiesSection
  | ValuationSection
  | StatsSection
  | TestimonialsSection
  | FaqSection
  | SplitSection;
export type SiteSectionType = SiteSection["type"];

export type SiteConfig = {
  // Cabecera: estilo del header. "floating" (pastilla glass flotante), "solid"
  // (barra sólida glass a ancho completo) o "transparent" (transparente sobre el
  // hero, logo izq · nav der, que pasa a cristal al hacer scroll). Default: floating.
  headerStyle?: "floating" | "solid" | "transparent";
  // Qué mostrar como marca. "logo" (usa brand_config.logoUrl, con el nombre de
  // fallback si no hay logo) o "text" (siempre el nombre). Default: logo.
  headerBrand?: "logo" | "text";
  // Escala del logo del header (multiplicador sobre el tamaño base). Default 1.
  logoScale?: number;
  // Campos planos de hero (legacy / fuente de la derivación retrocompatible).
  template?: "editorial" | "minimal" | "bold";
  heroEyebrow?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  // Footer / contacto — "chrome" permanente, no son secciones del cuerpo.
  about?: string;
  contactEmail?: string;
  contactPhone?: string;
  social?: SocialLink[];
  // Motor de secciones (canónico cuando está presente; si falta, se deriva).
  sections?: SiteSection[];
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
