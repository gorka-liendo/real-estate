import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AboutColumns,
  BigNumber,
  brandConfigToCssVars,
  Footer,
  PhotoPair,
  PillButton,
  Steps,
  WordmarkBleed,
} from "@rep/ui-tenant";
import { fetchTenant } from "@/lib/tenant";

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

  // Capa 2 white-label: el brand_config sobreescribe los defaults Dwell en runtime.
  const brandVars = brandConfigToCssVars(tenant.brandConfig);

  return (
    <div className="rt-root" style={{ ...brandVars, minHeight: "100vh" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "48px 32px" }}>
        <WordmarkBleed text={tenant.name.toUpperCase()} />

        <div style={{ padding: "48px 0" }}>
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

        <PhotoPair
          photos={[{ caption: "Verified Listing." }, { caption: "Private Tour." }]}
        />

        <div style={{ display: "flex", gap: 16, margin: "48px 0", flexWrap: "wrap" }}>
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

        <div style={{ marginTop: 64 }}>
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
