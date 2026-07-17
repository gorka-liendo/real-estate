import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer, PillLink, PropertyGrid, type Listing } from "@rep/ui-tenant";
import { fetchListings, fetchTenant, type PublicProperty } from "@/lib/tenant";

const KIND_LABEL: Record<PublicProperty["kind"], string> = {
  flat: "Piso",
  house: "Casa",
  commercial: "Local",
  land: "Terreno",
  garage: "Garaje",
};

function toListing(p: PublicProperty): Listing {
  const meta = [KIND_LABEL[p.kind], p.city, p.areaM2 ? `${p.areaM2} m²` : null]
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

  const listings = (await fetchListings(slug)).map(toListing);

  // Contenido = site_config del tenant, con defaults sensatos si viene vacío.
  const site = tenant.siteConfig ?? {};
  const heroEyebrow = site.heroEyebrow || "Inmobiliaria de confianza";
  const heroTitle = site.heroTitle || "Encuentra tu próximo hogar.";
  const heroSubtitle =
    site.heroSubtitle ||
    `${tenant.name} verifica cada propiedad en persona antes de publicarla: fotografía real, precios claros y cero ruido.`;
  const tagline = site.about || "Propiedades verificadas en persona, una a una.";

  const contactLinks = [
    site.contactEmail
      ? { label: "Escríbenos", href: `mailto:${site.contactEmail}` }
      : null,
    site.contactPhone
      ? { label: site.contactPhone, href: `tel:${site.contactPhone.replace(/\s/g, "")}` }
      : null,
    ...(site.social ?? []).map((s) => ({ label: s.label, href: s.url })),
  ].filter((x): x is { label: string; href: string } => x !== null);

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
            <a href="#propiedades">Propiedades</a>
            <a href="#contacto">Contacto</a>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="rt-hero">
        <div className="rt-wrap">
          <div className="rt-eyebrow">{heroEyebrow}</div>
          <h1 className="rt-hero__title">{heroTitle}</h1>
          <p className="rt-hero__sub">{heroSubtitle}</p>
          <PillLink href="#propiedades">Ver propiedades</PillLink>
        </div>
      </section>

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

      {/* footer */}
      <footer className="rt-section" id="contacto">
        <div className="rt-wrap">
          <Footer
            brandHeading={tenant.name}
            tagline={tagline}
            columns={[
              {
                heading: "Explora",
                links: [
                  { label: "Propiedades", href: "#propiedades" },
                  { label: "Contacto", href: "#contacto" },
                ],
              },
              {
                heading: "Contacto",
                links:
                  contactLinks.length > 0
                    ? contactLinks
                    : [{ label: "Escríbenos", href: "#" }],
              },
            ]}
          />
        </div>
      </footer>
    </div>
  );
}
