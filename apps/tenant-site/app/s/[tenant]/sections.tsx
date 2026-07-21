import type { ComponentType } from "react";
import {
  Faq,
  PillLink,
  PropertyGrid,
  StatGrid,
  Testimonials,
  type Listing,
} from "@rep/ui-tenant";
import type { PublicProperty, SiteConfig, SiteSection, SiteSectionType } from "@/lib/tenant";
import { ValuationWidget } from "./ValuationWidget";

// ============================================================================
// Motor de secciones del micrositio (Paso 1).
//
// El CUERPO del micrositio (entre topbar y footer) se renderiza desde una lista
// ORDENADA y ACTIVABLE de secciones (`site_config.sections[]`). Cada tipo de
// sección es una unidad autocontenida declarada en SECTION_REGISTRY:
//   - `moduleGate?`  → además de `enabled`, exige un módulo contratado.
//   - `anchor?`/`navLabel?` → si tiene ancla, aparece en la nav automáticamente.
//   - `Body`         → el componente presentacional (usa tokens del DS).
//
// Añadir una sección nueva = 1 entrada en el registro + 1 componente Body.
// El bucle de render (page.tsx) NO se toca: esa es la escalabilidad del motor.
// ============================================================================

/** Datos de la app que las secciones necesitan para pintarse. */
export type SectionContext = {
  slug: string;
  tenantName: string;
  listings: Listing[];
  featured?: PublicProperty;
};

type SectionDef<T extends SiteSection = SiteSection> = {
  /** Módulo requerido (además de `enabled`) para que la sección sea visible. */
  moduleGate?: string;
  /** Ancla del deep-link. Sin ancla, la sección no puede ir al navbar. */
  anchor?: string;
  /** Etiqueta de nav POR DEFECTO cuando la sección no define `navLabel`
   *  (retrocompat: properties/valuation salen; el resto no). El cliente lo
   *  controla por sección con `section.navLabel`. */
  defaultNavLabel?: string;
  Body: ComponentType<{ section: T; ctx: SectionContext }>;
};

// --- Hero -------------------------------------------------------------------
function HeroBody({
  section,
  ctx,
}: {
  section: Extract<SiteSection, { type: "hero" }>;
  ctx: SectionContext;
}) {
  const template = section.template ?? "editorial";
  const eyebrow = section.eyebrow || "Inmobiliaria de confianza";
  const title = section.title || "Encuentra tu próximo hogar.";
  const subtitle =
    section.subtitle ||
    `${ctx.tenantName} verifica cada propiedad en persona antes de publicarla: fotografía real, precios claros y cero ruido.`;
  const featured = ctx.featured;

  // Media de fondo propia (subida por el cliente): hero "cover" a pantalla
  // completa. Tiene PRECEDENCIA sobre la plantilla. Si hay vídeo manda (con la
  // imagen de poster/fallback); si no, la imagen. Reutiliza el tratamiento bold.
  const bgVideo = section.backgroundVideoUrl;
  const bgImage = section.backgroundImageUrl;
  if (bgVideo || bgImage) {
    return (
      <section className="rt-hero rt-hero--bold rt-hero--cover">
        {bgVideo ? (
          <video
            className="rt-hero__bg"
            autoPlay
            muted
            loop
            playsInline
            poster={bgImage}
            preload="metadata"
          >
            <source src={bgVideo} />
          </video>
        ) : (
          <img className="rt-hero__bg" src={bgImage} alt="" aria-hidden="true" decoding="async" />
        )}
        <div className="rt-hero__scrim" aria-hidden="true" />
        <div className="rt-wrap">
          <div className="rt-eyebrow">{eyebrow}</div>
          <h1 className="rt-hero__title">{title}</h1>
          <p className="rt-hero__sub">{subtitle}</p>
          <PillLink href="#propiedades">Ver propiedades</PillLink>
        </div>
      </section>
    );
  }

  // bold = full-bleed con la foto de fondo. Sin foto, cae al tratamiento
  // solo-texto (editorial/minimal) para no mostrar un hero vacío.
  if (template === "bold" && featured) {
    return (
      <section className="rt-hero rt-hero--bold">
        <img
          className="rt-hero__bg"
          src={featured.photos[0]}
          alt=""
          aria-hidden="true"
          decoding="async"
        />
        <div className="rt-hero__scrim" aria-hidden="true" />
        <div className="rt-wrap">
          <div className="rt-eyebrow">{eyebrow}</div>
          <h1 className="rt-hero__title">{title}</h1>
          <p className="rt-hero__sub">{subtitle}</p>
          <PillLink href="#propiedades">Ver propiedades</PillLink>
        </div>
      </section>
    );
  }

  return (
    <section className={`rt-hero${template === "minimal" ? " rt-hero--minimal" : ""}`}>
      <div className="rt-wrap">
        <div className={template === "editorial" && featured ? "rt-hero__grid" : undefined}>
          <div>
            <div className="rt-eyebrow">{eyebrow}</div>
            <h1 className="rt-hero__title">{title}</h1>
            <p className="rt-hero__sub">{subtitle}</p>
            <PillLink href="#propiedades">Ver propiedades</PillLink>
          </div>
          {template === "editorial" && featured ? (
            <a
              className="rt-hero__media"
              href={`/propiedad/${featured.id}`}
              aria-label={`Ver ${featured.title}`}
            >
              <img src={featured.photos[0]} alt={featured.title} decoding="async" />
              <span className="rt-hero__media-caption">
                {featured.title}
                {featured.price != null
                  ? ` · ${new Intl.NumberFormat("es-ES").format(featured.price)} €`
                  : ""}
              </span>
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// --- Propiedades ------------------------------------------------------------
function PropertiesBody({
  section,
  ctx,
}: {
  section: Extract<SiteSection, { type: "properties" }>;
  ctx: SectionContext;
}) {
  return (
    <section className="rt-section" id="propiedades">
      <div className="rt-wrap">
        <div className="rt-eyebrow">{section.eyebrow || "En venta y alquiler"}</div>
        <h2 className="rt-section-title">{section.title || "Propiedades"}</h2>
        {ctx.listings.length > 0 ? (
          <PropertyGrid items={ctx.listings} />
        ) : (
          <p style={{ color: "var(--tenant-muted)", maxWidth: "48ch" }}>
            Pronto publicaremos nuestra selección de inmuebles. Vuelve en unos días.
          </p>
        )}
      </div>
    </section>
  );
}

// --- Valoración (gateada por el módulo 'valuation') -------------------------
function ValuationBody({
  section,
  ctx,
}: {
  section: Extract<SiteSection, { type: "valuation" }>;
  ctx: SectionContext;
}) {
  return (
    <section className="rt-section" id="valoracion">
      <div className="rt-wrap">
        <div className="rt-eyebrow">{section.eyebrow || "¿Vendes tu piso?"}</div>
        <h2 className="rt-section-title">{section.title || "Valora tu piso gratis."}</h2>
        <p style={{ color: "var(--tenant-muted)", maxWidth: "48ch", marginTop: 0 }}>
          {section.intro ||
            "Cuéntanos cómo es tu inmueble y te damos una estimación orientativa al momento, basada en operaciones reales de nuestra cartera."}
        </p>
        <div style={{ maxWidth: 560 }}>
          <ValuationWidget slug={ctx.slug} />
        </div>
      </div>
    </section>
  );
}

// --- Cifras -----------------------------------------------------------------
function StatsBody({
  section,
}: {
  section: Extract<SiteSection, { type: "stats" }>;
  ctx: SectionContext;
}) {
  const items = section.items ?? [];
  if (items.length === 0) return null; // sección vacía → no se pinta
  return (
    <section className="rt-section" id="cifras">
      <div className="rt-wrap">
        {section.eyebrow ? <div className="rt-eyebrow">{section.eyebrow}</div> : null}
        {section.title ? <h2 className="rt-section-title">{section.title}</h2> : null}
        <StatGrid items={items} />
      </div>
    </section>
  );
}

// --- Testimonios ------------------------------------------------------------
function TestimonialsBody({
  section,
}: {
  section: Extract<SiteSection, { type: "testimonials" }>;
  ctx: SectionContext;
}) {
  const items = (section.items ?? []).filter((t) => t.quote.trim() && t.author.trim());
  if (items.length === 0) return null;
  return (
    <section className="rt-section" id="opiniones">
      <div className="rt-wrap">
        {section.eyebrow ? <div className="rt-eyebrow">{section.eyebrow}</div> : null}
        {section.title ? <h2 className="rt-section-title">{section.title}</h2> : null}
        <Testimonials items={items} />
      </div>
    </section>
  );
}

// --- Preguntas frecuentes ---------------------------------------------------
function FaqBody({
  section,
}: {
  section: Extract<SiteSection, { type: "faq" }>;
  ctx: SectionContext;
}) {
  const items = (section.items ?? []).filter((f) => f.question.trim() && f.answer.trim());
  if (items.length === 0) return null;
  return (
    <section className="rt-section" id="faq">
      <div className="rt-wrap">
        {section.eyebrow ? <div className="rt-eyebrow">{section.eyebrow}</div> : null}
        {section.title ? <h2 className="rt-section-title">{section.title}</h2> : null}
        <Faq items={items} />
      </div>
    </section>
  );
}

// Registro tipado: la clave es el `type` de la sección. eslint no infiere la
// covarianza del ComponentType con Extract, de ahí el cast controlado.
// `anchor` = deep-link; `defaultNavLabel` = etiqueta de nav por defecto cuando la
// sección no define `navLabel` (properties/valuation salen por defecto; el resto
// no, hasta que el cliente les ponga etiqueta desde el editor).
export const SECTION_REGISTRY: Record<SiteSectionType, SectionDef> = {
  hero: { Body: HeroBody as SectionDef["Body"] },
  properties: {
    anchor: "propiedades",
    defaultNavLabel: "Propiedades",
    Body: PropertiesBody as SectionDef["Body"],
  },
  valuation: {
    moduleGate: "valuation",
    anchor: "valoracion",
    defaultNavLabel: "Valora tu piso",
    Body: ValuationBody as SectionDef["Body"],
  },
  stats: {
    anchor: "cifras",
    Body: StatsBody as SectionDef["Body"],
  },
  testimonials: {
    anchor: "opiniones",
    Body: TestimonialsBody as SectionDef["Body"],
  },
  faq: {
    anchor: "faq",
    Body: FaqBody as SectionDef["Body"],
  },
};

/**
 * Lista de secciones del tenant. Si `site_config.sections` está presente y no
 * vacío, manda; si no, se DERIVA de los campos planos (retrocompatibilidad:
 * un tenant de onboarding sigue viéndose idéntico sin migrar datos).
 */
export function resolveSections(site: SiteConfig): SiteSection[] {
  if (site.sections && site.sections.length > 0) return site.sections;
  return [
    {
      id: "hero",
      type: "hero",
      enabled: true,
      template: site.template,
      eyebrow: site.heroEyebrow,
      title: site.heroTitle,
      subtitle: site.heroSubtitle,
    },
    { id: "properties", type: "properties", enabled: true },
    // valuation queda activa por defecto; su `moduleGate` decide si se pinta,
    // igual que el comportamiento previo (solo con el módulo contratado).
    { id: "valuation", type: "valuation", enabled: true },
  ];
}

/** Secciones que deben pintarse: activas y con su módulo (si lo exigen). */
export function visibleSections(
  sections: SiteSection[],
  activeModules: string[],
): SiteSection[] {
  return sections.filter((s) => {
    if (!s.enabled) return false;
    const gate = SECTION_REGISTRY[s.type].moduleGate;
    return !gate || activeModules.includes(gate);
  });
}

/** Etiqueta efectiva de una sección en el navbar: su `navLabel` si está
 *  definido (incluido "" = ocultar), o el default del tipo si es `undefined`. */
export function effectiveNavLabel(section: SiteSection): string {
  const def = SECTION_REGISTRY[section.type];
  const label = section.navLabel !== undefined ? section.navLabel : (def.defaultNavLabel ?? "");
  return def.anchor ? label.trim() : "";
}

/** Ítems del navbar: cada sección visible con etiqueta efectiva no vacía, en el
 *  orden de las secciones. El cliente lo controla por sección (`navLabel`). */
export function sectionNavItems(sections: SiteSection[]): { label: string; href: string }[] {
  return sections.flatMap((s) => {
    const label = effectiveNavLabel(s);
    const anchor = SECTION_REGISTRY[s.type].anchor;
    return label && anchor ? [{ label, href: `#${anchor}` }] : [];
  });
}
