import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gallery, MobileNav, OPERATION_LABELS, type GalleryItem } from "@rep/ui-tenant";
import { fetchProperty, fetchTenant, type PublicProperty } from "@/lib/tenant";
import { CONDITION_LABELS, featureLabel, KIND_LABELS } from "@/lib/property-meta";
import { ContactForm } from "../../ContactForm";

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

  const d = property.details ?? {};
  const site = tenant.siteConfig ?? {};

  // Datos rápidos (chips de la ficha)
  const facts: Array<{ k: string; v: string }> = [];
  if (property.areaM2) facts.push({ k: "Superficie", v: `${property.areaM2} m²` });
  if (property.bedrooms != null) facts.push({ k: "Habitaciones", v: String(property.bedrooms) });
  if (property.bathrooms != null) facts.push({ k: "Baños", v: String(property.bathrooms) });
  facts.push({ k: "Tipo", v: d.subtype || KIND_LABELS[property.kind] });
  if (d.floor) facts.push({ k: "Planta", v: d.floor });
  if (d.condition) facts.push({ k: "Estado", v: CONDITION_LABELS[d.condition] ?? d.condition });
  if (d.yearBuilt) facts.push({ k: "Año", v: String(d.yearBuilt) });
  if (d.energyCert) facts.push({ k: "Cert. energético", v: d.energyCert });

  // Ubicación
  const locParts = [d.neighborhood, property.city, d.province].filter(Boolean) as string[];

  return (
    <div
      className="rt-root"
      data-theme={tenant.brandConfig.theme ?? "dwell"}
      style={{ minHeight: "100vh" }}
    >
      <header className="rt-topbar">
        <div className="rt-wrap rt-topbar__inner">
          <Link className="rt-topbar__brand" href="/" style={{ textDecoration: "none" }}>
            {tenant.name}
          </Link>
          <nav className="rt-topbar__nav">
            <Link href="/#propiedades">Propiedades</Link>
            <Link href="/#contacto">Contacto</Link>
          </nav>
          <MobileNav
            items={[
              { label: "Propiedades", href: "/#propiedades" },
              { label: "Contacto", href: "/#contacto" },
            ]}
          />
        </div>
      </header>

      <section className="rt-section" style={{ borderTop: "none" }}>
        <div className="rt-wrap">
          <Link className="rt-detail__back" href="/#propiedades">
            ← Volver a propiedades
          </Link>

          {/* Galería: mosaico + visor fullscreen; los vídeos son slides más */}
          <Gallery
            title={property.title}
            items={[
              ...property.photos.map((url): GalleryItem => ({ type: "photo", url })),
              ...property.videos.map((url): GalleryItem => ({ type: "video", url })),
            ]}
          />

          <div className="rt-detail">
            {/* Columna principal */}
            <div className="rt-detail__main">
              <div className="rt-eyebrow">
                {OPERATION_LABELS[property.operation]}
                {locParts.length ? ` · ${locParts.join(", ")}` : ""}
              </div>
              <h1
                className="rt-section-title"
                style={{ fontSize: "clamp(28px, 6vw, 44px)", marginBottom: 0 }}
              >
                {property.title}
              </h1>

              {/* Datos rápidos */}
              <div className="rt-detail__facts">
                {facts.map((f) => (
                  <div key={f.k}>
                    <div className="rt-detail__fact-k">{f.k}</div>
                    <div className="rt-detail__fact-v">{f.v}</div>
                  </div>
                ))}
              </div>

              {property.description ? (
                <div className="rt-block">
                  <h2 className="rt-block__title">Descripción</h2>
                  <p className="rt-detail__desc">{property.description}</p>
                </div>
              ) : null}

              {property.features.length > 0 ? (
                <div className="rt-block">
                  <h2 className="rt-block__title">Características</h2>
                  <ul className="rt-features">
                    {property.features.map((f) => (
                      <li key={f} className="rt-feature">
                        <span className="rt-feature__dot">
                          <CheckIcon />
                        </span>
                        {featureLabel(f)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {locParts.length || property.address ? (
                <div className="rt-block">
                  <h2 className="rt-block__title">Ubicación</h2>
                  <p className="rt-detail__desc">
                    {property.address ? `${property.address}, ` : ""}
                    {locParts.join(", ")}
                  </p>
                </div>
              ) : null}
            </div>

            {/* Aside: tarjeta de contacto pegajosa */}
            <aside className="rt-detail__aside">
              <div className="rt-contactcard">
                <div className="rt-contactcard__op">{OPERATION_LABELS[property.operation]}</div>
                <div className="rt-contactcard__price">{priceStr(property)}</div>

                <ContactForm
                  slug={slug}
                  propertyId={property.id}
                  submitLabel="Solicitar información"
                />

                <hr className="rt-contactcard__sep" />
                <p className="rt-contactcard__agency">{tenant.name}</p>
                {site.contactPhone ? (
                  <a className="rt-contactcard__row" href={`tel:${site.contactPhone}`}>
                    <PhoneIcon />
                    {site.contactPhone}
                  </a>
                ) : null}
                {site.contactEmail ? (
                  <a className="rt-contactcard__row" href={`mailto:${site.contactEmail}`}>
                    <MailIcon />
                    {site.contactEmail}
                  </a>
                ) : null}

                {d.reference ? (
                  <>
                    <hr className="rt-contactcard__sep" />
                    <div className="rt-contactcard__op">Ref. {d.reference}</div>
                  </>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
