import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PillLink } from "@rep/ui-tenant";
import { fetchProperty, fetchTenant, type PublicProperty } from "@/lib/tenant";

const KIND_LABEL: Record<PublicProperty["kind"], string> = {
  flat: "Piso",
  house: "Casa",
  commercial: "Local",
  land: "Terreno",
  garage: "Garaje",
};
const OPERATION_LABEL = { sale: "En venta", rent: "En alquiler" } as const;

export const revalidate = 60;

type Params = { params: Promise<{ tenant: string; id: string }> };

function priceStr(p: PublicProperty): string {
  if (p.price == null) return "Consultar precio";
  return `${new Intl.NumberFormat("es-ES").format(p.price)} €${p.operation === "rent" ? "/mes" : ""}`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenant: slug, id } = await params;
  const p = await fetchProperty(slug, id);
  return { title: p ? p.title : "No encontrado" };
}

export default async function PropertyDetail({ params }: Params) {
  const { tenant: slug, id } = await params;
  const [tenant, property] = await Promise.all([fetchTenant(slug), fetchProperty(slug, id)]);
  if (!tenant || !property) notFound();

  const facts: Array<{ k: string; v: string }> = [];
  if (property.areaM2) facts.push({ k: "Superficie", v: `${property.areaM2} m²` });
  if (property.bedrooms != null) facts.push({ k: "Habitaciones", v: String(property.bedrooms) });
  if (property.bathrooms != null) facts.push({ k: "Baños", v: String(property.bathrooms) });
  facts.push({ k: "Tipo", v: KIND_LABEL[property.kind] });

  return (
    <div
      className="rt-root"
      data-theme={tenant.brandConfig.theme ?? "dwell"}
      style={{ minHeight: "100vh" }}
    >
      <header className="rt-topbar">
        <div className="rt-wrap rt-topbar__inner">
          <a className="rt-topbar__brand" href="/" style={{ textDecoration: "none" }}>
            {tenant.name}
          </a>
          <nav className="rt-topbar__nav">
            <a href="/#propiedades">Propiedades</a>
            <a href="/#contacto">Contacto</a>
          </nav>
        </div>
      </header>

      <section className="rt-section" style={{ borderTop: "none" }}>
        <div className="rt-wrap">
          <a className="rt-detail__back" href="/#propiedades">
            ← Volver a propiedades
          </a>

          {property.photos.length > 0 ? (
            <div className="rt-gallery">
              {property.photos.map((url, i) => (
                <img
                  key={url}
                  className={`rt-gallery__img${i === 0 ? " rt-gallery__img--main" : ""}`}
                  src={url}
                  alt={property.title}
                />
              ))}
            </div>
          ) : (
            <div className="rt-gallery">
              <div className="rt-gallery__img rt-gallery__img--main" role="img" aria-label={property.title} />
            </div>
          )}

          <div className="rt-eyebrow">
            {OPERATION_LABEL[property.operation]}
            {property.city ? ` · ${property.city}` : ""}
          </div>
          <h1 className="rt-section-title" style={{ fontSize: 44, marginBottom: 0 }}>
            {property.title}
          </h1>
          <div className="rt-detail__price">{priceStr(property)}</div>

          <div className="rt-detail__facts">
            {facts.map((f) => (
              <div key={f.k}>
                <div className="rt-detail__fact-k">{f.k}</div>
                <div className="rt-detail__fact-v">{f.v}</div>
              </div>
            ))}
          </div>

          {property.description ? (
            <p className="rt-detail__desc">{property.description}</p>
          ) : null}

          <div style={{ marginTop: "var(--tenant-sp-6)" }}>
            <PillLink href="/#contacto">Solicitar información</PillLink>
          </div>
        </div>
      </section>
    </div>
  );
}
