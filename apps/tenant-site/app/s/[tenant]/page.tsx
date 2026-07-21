import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import {
  MobileNav,
  OPERATION_LABELS,
  PillLink,
  PROPERTY_KIND_LABELS,
  type Listing,
} from "@rep/ui-tenant";
import { fetchListings, fetchModules, fetchTenant, type PublicProperty } from "@/lib/tenant";
import {
  resolveSections,
  SECTION_REGISTRY,
  sectionNavItems,
  visibleSections,
  type SectionContext,
} from "./sections";
import { RevealList } from "./RevealList";
import { SiteFooter } from "./SiteFooter";
import { TopbarBrand } from "./TopbarBrand";

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

  // Propiedad destacada del hero: la primera publicada CON foto (si no hay,
  // el hero cae con elegancia al diseño solo-texto de siempre).
  const featured = rawListings.find((p) => p.photos.length > 0);

  // Motor de secciones: resuelve la lista (o la deriva de campos planos),
  // filtra por activación + módulo, y deriva la nav. El footer/"Contacto" es
  // chrome permanente, se añade aparte.
  const site = tenant.siteConfig ?? {};
  const sections = visibleSections(resolveSections(site), activeModules);
  const ctx: SectionContext = { slug, tenantName: tenant.name, listings, featured };
  // Nav centrado = secciones; el contacto va en el CTA de la derecha. El menú
  // móvil los junta (secciones + contacto).
  const sectionNav = sectionNavItems(sections);
  const mobileNavItems = [...sectionNav, { label: "Contacto", href: "#contacto" }];

  return (
    <div
      className="rt-root"
      data-theme={tenant.brandConfig.theme ?? "dwell"}
      style={{ minHeight: "100vh", "--rt-logo-scale": site.logoScale ?? 1 } as CSSProperties}
    >
      {/* topbar: logo · nav centrado · CTA (flotante o barra sólida) */}
      <header className={`rt-topbar${site.headerStyle === "solid" ? " rt-topbar--solid" : ""}`}>
        <div className="rt-topbar__inner">
          <div className="rt-topbar__left">
            <TopbarBrand
              name={tenant.name}
              logoUrl={tenant.brandConfig.logoUrl}
              mode={site.headerBrand}
            />
          </div>
          <nav className="rt-topbar__nav">
            {sectionNav.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="rt-topbar__right">
            <PillLink href="#contacto" className="rt-topbar__cta">
              Contacta con nosotros
            </PillLink>
            <MobileNav items={mobileNavItems} />
          </div>
        </div>
      </header>

      {/* cuerpo del micrositio: secciones ordenadas y activables (motor).
          RevealList anima la aparición sutil de cada sección al hacer scroll. */}
      <RevealList>
        {sections.map((section) => {
          const { Body } = SECTION_REGISTRY[section.type];
          return <Body key={section.id} section={section} ctx={ctx} />;
        })}
      </RevealList>

      {/* footer personalizado de la inmobiliaria (compartido con la ficha) */}
      <SiteFooter tenant={tenant} />
    </div>
  );
}
