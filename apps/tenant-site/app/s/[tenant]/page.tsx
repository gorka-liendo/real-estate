import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  brandConfigToCssVars,
  Footer,
  PillLink,
  PropertyGrid,
  type Listing,
} from "@rep/ui-tenant";
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
  return { id: p.id, title: p.title, meta, price };
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
  const brandVars = brandConfigToCssVars(tenant.brandConfig); // white-label runtime

  return (
    <div className="rt-root" style={{ ...brandVars, minHeight: "100vh" }}>
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
          <div className="rt-eyebrow">Inmobiliaria de confianza</div>
          <h1 className="rt-hero__title">Encuentra tu próximo hogar.</h1>
          <p className="rt-hero__sub">
            {tenant.name} verifica cada propiedad en persona antes de publicarla:
            fotografía real, precios claros y cero ruido.
          </p>
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
            tagline="Propiedades verificadas en persona, una a una."
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
                links: [
                  { label: "Escríbenos", href: "#" },
                  { label: "Instagram", href: "#" },
                ],
              },
            ]}
          />
        </div>
      </footer>
    </div>
  );
}
