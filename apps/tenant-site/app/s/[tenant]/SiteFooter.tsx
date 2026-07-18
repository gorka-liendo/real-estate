import { Footer, type FooterColumn } from "@rep/ui-tenant";
import type { TenantData } from "@/lib/tenant";

// Footer del micrositio — UNA sola implementación para todas las páginas
// (home y ficha). Personalizado por inmobiliaria: logo (brand_config.logoUrl),
// dirección/horario y contacto (site_config) y barra de copyright con su nombre.
// `homePrefix`: "" en el home (anclas locales) y "/" en páginas interiores.
export function SiteFooter({
  tenant,
  homePrefix = "",
}: {
  tenant: TenantData;
  homePrefix?: string;
}) {
  const site = tenant.siteConfig ?? {};
  const tagline = site.about || "Propiedades verificadas en persona, una a una.";

  const contactLinks = [
    site.contactEmail ? { label: "Escríbenos", href: `mailto:${site.contactEmail}` } : null,
    site.contactPhone
      ? { label: site.contactPhone, href: `tel:${site.contactPhone.replace(/\s/g, "")}` }
      : null,
    ...(site.social ?? []).map((s) => ({ label: s.label, href: s.url })),
  ].filter((x): x is { label: string; href: string } => x !== null);

  const visitLines = [site.footerAddress, site.footerSchedule]
    .filter((x): x is string => Boolean(x))
    .map((label) => ({ label })); // sin href → texto plano

  const columns: FooterColumn[] = [
    {
      heading: "Explora",
      links: [
        { label: "Propiedades", href: `${homePrefix}#propiedades` },
        { label: "Contacto", href: `${homePrefix}#contacto` },
      ],
    },
    ...(visitLines.length > 0 ? [{ heading: "Visítanos", links: visitLines }] : []),
    ...(contactLinks.length > 0 ? [{ heading: "Contacto", links: contactLinks }] : []),
  ];

  return (
    <footer className="rt-section" id="contacto">
      <div className="rt-wrap">
        <Footer
          brandHeading={tenant.name}
          tagline={tagline}
          logoUrl={tenant.brandConfig.logoUrl}
          columns={columns}
          bottomText={`© ${new Date().getFullYear()} ${tenant.name} · Todos los derechos reservados`}
        />
      </div>
    </footer>
  );
}
