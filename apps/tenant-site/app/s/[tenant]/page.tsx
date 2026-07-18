import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  MobileNav,
  OPERATION_LABELS,
  PillLink,
  PROPERTY_KIND_LABELS,
  PropertyGrid,
  type Listing,
} from "@rep/ui-tenant";
import { fetchListings, fetchModules, fetchTenant, type PublicProperty } from "@/lib/tenant";
import { SiteFooter } from "./SiteFooter";
import { ValuationWidget } from "./ValuationWidget";

function toListing(p: PublicProperty): Listing {
  const meta = [PROPERTY_KIND_LABELS[p.kind], p.city, p.areaM2 ? `${p.areaM2} m²` : null]
    .filter(Boolean)
    .join(" · ");
  const price =
    p.price == null
      ? "Consultar"
      : `${new Intl.NumberFormat("es-ES").format(p.price)} €${p.operation === "rent" ? "/mes" : ""}`;
  return {
    id: p.id,
    title: p.title,
    meta,
    price,
    imageUrl: p.photos[0],
    href: `/propiedad/${p.id}`,
    badge: OPERATION_LABELS[p.operation],
  };
}

export const revalidate = 60; // ISR

type Params = { params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenant: slug } = await params;
  const tenant = await fetchTenant(slug);
  if (!tenant) return { title: "No encontrado" };
  return {
    title: tenant.name,
    description: `${tenant.name} — propiedades verificadas, una a una.`,
  };
}

export default async function Microsite({ params }: Params) {
  const { tenant: slug } = await params;
  const tenant = await fetchTenant(slug);
  if (!tenant) notFound();

  const [rawListings, activeModules] = await Promise.all([
    fetchListings(slug),
    fetchModules(slug),
  ]);
  const listings = rawListings.map(toListing);
  const hasValuation = activeModules.includes("valuation");

  // Propiedad destacada del hero: la primera publicada CON foto (si no hay,
  // el hero cae con elegancia al diseño solo-texto de siempre).
  const featured = rawListings.find((p) => p.photos.length > 0);

  const navItems = [
    { label: "Propiedades", href: "#propiedades" },
    ...(hasValuation ? [{ label: "Valora tu piso", href: "#valoracion" }] : []),
    { label: "Contacto", href: "#contacto" },
  ];

  // Contenido = site_config del tenant, con defaults sensatos si viene vacío.
  const site = tenant.siteConfig ?? {};
  const template = site.template ?? "editorial";
  const heroEyebrow = site.heroEyebrow || "Inmobiliaria de confianza";
  const heroTitle = site.heroTitle || "Encuentra tu próximo hogar.";
  const heroSubtitle =
    site.heroSubtitle ||
    `${tenant.name} verifica cada propiedad en persona antes de publicarla: fotografía real, precios claros y cero ruido.`;

  return (
    <div
      className="rt-root"
      data-theme={tenant.brandConfig.theme ?? "dwell"}
      style={{ minHeight: "100vh" }}
    >
      {/* topbar */}
      <header className="rt-topbar">
        <div className="rt-wrap rt-topbar__inner">
          <span className="rt-topbar__brand">{tenant.name}</span>
          <nav className="rt-topbar__nav">
            {navItems.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <MobileNav items={navItems} />
        </div>
      </header>

      {/* hero según plantilla (site_config.template):
          editorial = texto + foto destacada · minimal = centrado solo-texto ·
          bold = full-bleed con la foto de fondo. Sin foto, bold/editorial caen
          al tratamiento solo-texto. */}
      {template === "bold" && featured ? (
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
            <div className="rt-eyebrow">{heroEyebrow}</div>
            <h1 className="rt-hero__title">{heroTitle}</h1>
            <p className="rt-hero__sub">{heroSubtitle}</p>
            <PillLink href="#propiedades">Ver propiedades</PillLink>
          </div>
        </section>
      ) : (
        <section className={`rt-hero${template === "minimal" ? " rt-hero--minimal" : ""}`}>
          <div className="rt-wrap">
            <div className={template === "editorial" && featured ? "rt-hero__grid" : undefined}>
              <div>
                <div className="rt-eyebrow">{heroEyebrow}</div>
                <h1 className="rt-hero__title">{heroTitle}</h1>
                <p className="rt-hero__sub">{heroSubtitle}</p>
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
      )}

      {/* propiedades */}
      <section className="rt-section" id="propiedades">
        <div className="rt-wrap">
          <div className="rt-eyebrow">En venta y alquiler</div>
          <h2 className="rt-section-title">Propiedades</h2>
          {listings.length > 0 ? (
            <PropertyGrid items={listings} />
          ) : (
            <p style={{ color: "var(--tenant-muted)", maxWidth: "48ch" }}>
              Pronto publicaremos nuestra selección de inmuebles. Vuelve en unos días.
            </p>
          )}
        </div>
      </section>

      {/* valoración de pisos — solo si el tenant tiene el módulo 'valuation' */}
      {hasValuation ? (
        <section className="rt-section" id="valoracion">
          <div className="rt-wrap">
            <div className="rt-eyebrow">¿Vendes tu piso?</div>
            <h2 className="rt-section-title">Valora tu piso gratis.</h2>
            <p style={{ color: "var(--tenant-muted)", maxWidth: "48ch", marginTop: 0 }}>
              Cuéntanos cómo es tu inmueble y te damos una estimación orientativa al momento,
              basada en operaciones reales de nuestra cartera.
            </p>
            <div style={{ maxWidth: 560 }}>
              <ValuationWidget slug={slug} />
            </div>
          </div>
        </section>
      ) : null}

      {/* footer personalizado de la inmobiliaria (compartido con la ficha) */}
      <SiteFooter tenant={tenant} />
    </div>
  );
}
