import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AboutColumns,
  BigNumber,
  brandConfigToCssVars,
  Footer,
  PillButton,
  PropertyGrid,
  Steps,
  WordmarkBleed,
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

  // Capa 2 white-label: el brand_config sobreescribe los defaults Dwell en runtime.
  const brandVars = brandConfigToCssVars(tenant.brandConfig);

  return (
    <div className="rt-root" style={{ ...brandVars, minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "var(--tenant-sp-6) var(--tenant-sp-5)",
        }}
      >
        <WordmarkBleed text={tenant.name.toUpperCase()} />

        <div style={{ padding: "var(--tenant-sp-6) 0" }}>
          <AboutColumns
            columns={[
              {
                title: "The Challenge",
                body: "Una experiencia de listado premium y calma, plenamente funcional: fotografía verificada, precios claros y cero ruido.",
              },
              {
                title: "Design Approach",
                body: "Imágenes grandes, tipografía sobredimensionada y paleta neutra para que cada propiedad sea el foco visual.",
              },
            ]}
          />
        </div>

        <BigNumber number="01" quote="Listamos una casa cada vez. La verificamos bien.">
          <p style={{ color: "var(--tenant-muted)", maxWidth: 480 }}>
            Cada propiedad de {tenant.name} se visita en persona antes de publicarse.
          </p>
        </BigNumber>

        {listings.length > 0 ? (
          <section style={{ padding: "var(--tenant-sp-8) 0" }}>
            <div className="rt-eyebrow">En venta y alquiler</div>
            <h2 className="rt-section-title">Propiedades</h2>
            <PropertyGrid items={listings} />
          </section>
        ) : null}

        <div style={{ display: "flex", gap: "var(--tenant-sp-3)", margin: "var(--tenant-sp-7) 0", flexWrap: "wrap" }}>
          <PillButton>Reservar visita</PillButton>
          <PillButton variant="outline">Ver todas las propiedades</PillButton>
        </div>

        <Steps
          steps={[
            { title: "Site Visit", body: "Cada propiedad se visita en persona antes de aceptar el listado." },
            { title: "Document Check", body: "Verificación legal y de titularidad, sin excepciones." },
            { title: "Photography", body: "Fotografía profesional in situ — nunca imágenes de stock." },
            { title: "Listing Review", body: "Revisión final antes de publicar." },
          ]}
        />

        <div style={{ marginTop: "var(--tenant-sp-7)" }}>
          <Footer
            brandHeading={`${tenant.name} · Real Estate`}
            tagline="Listamos una casa cada vez. Cada propiedad se verifica en persona antes de llegar a la plataforma."
            columns={[
              {
                heading: "Navigate",
                links: [
                  { label: "Home", href: "#" },
                  { label: "About", href: "#" },
                  { label: "Listings", href: "#" },
                ],
              },
              {
                heading: "Listings",
                links: [
                  { label: "Apartamentos", href: "#" },
                  { label: "Casas", href: "#" },
                ],
              },
              {
                heading: "Contact",
                links: [
                  { label: "Instagram", href: "#" },
                  { label: "Reservar visita", href: "#" },
                ],
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
