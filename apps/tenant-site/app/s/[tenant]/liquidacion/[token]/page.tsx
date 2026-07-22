import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { fetchSettlement, fetchTenant, topbarClass } from "@/lib/tenant";
import { HeaderScroll } from "../../HeaderScroll";
import { SiteFooter } from "../../SiteFooter";
import { SettlementView } from "../../SettlementView";
import { TopbarBrand } from "../../TopbarBrand";

// Liquidación de gastos para inquilinos: enlace privado por token que la agencia
// comparte. Server-rendered, sin caché y SIN indexar.
export const metadata: Metadata = {
  title: "Reparto de gastos",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ tenant: string; token: string }> };

export default async function TenantSettlement({ params }: Params) {
  const { tenant: slug, token } = await params;
  const [tenant, data] = await Promise.all([fetchTenant(slug), fetchSettlement(slug, token)]);
  if (!tenant || !data) notFound();

  return (
    <div
      className="rt-root"
      data-theme={tenant.brandConfig.theme ?? "dwell"}
      style={{ minHeight: "100vh", "--rt-logo-scale": tenant.siteConfig?.logoScale ?? 1 } as CSSProperties}
    >
      <header className={topbarClass(tenant.siteConfig?.headerStyle)}>
        <HeaderScroll />
        <div className="rt-topbar__inner rt-topbar__inner--split">
          <div className="rt-topbar__left">
            <TopbarBrand
              name={tenant.name}
              logoUrl={tenant.brandConfig.logoUrl}
              mode={tenant.siteConfig?.headerBrand}
            />
          </div>
          <span className="rt-eyebrow" style={{ margin: 0 }}>
            Reparto de gastos
          </span>
        </div>
      </header>

      <section className="rt-section" style={{ borderTop: "none" }}>
        <div className="rt-wrap">
          <div className="rt-eyebrow">{data.propertyTitle}</div>
          <h1 className="rt-section-title">Reparto de gastos del piso.</h1>
          <p style={{ color: "var(--tenant-muted)", maxWidth: "56ch", marginTop: "calc(-1 * var(--tenant-sp-3))" }}>
            Lo que paga cada inquilino: su alquiler más la parte de cada factura, repartida por los
            días que cada uno ha vivido en el piso durante el periodo de la factura.
          </p>
          <div style={{ marginTop: "var(--tenant-sp-5)" }}>
            <SettlementView settlement={data.settlement} />
          </div>
        </div>
      </section>

      <SiteFooter tenant={tenant} homePrefix="/" />
    </div>
  );
}
