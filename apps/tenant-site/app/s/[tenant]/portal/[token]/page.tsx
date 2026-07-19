import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OPERATION_LABELS } from "@rep/ui-tenant";
import { fetchPortal, fetchTenant, type PortalProperty } from "@/lib/tenant";
import { SiteFooter } from "../../SiteFooter";

// Portal del propietario: enlace privado por token que la agencia comparte con
// el dueño. Server-rendered sin caché y SIN indexar (robots noindex).

export const metadata: Metadata = {
  title: "Tu inmueble",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<PortalProperty["status"], string> = {
  draft: "En preparación",
  published: "Publicado",
  archived: "Archivado",
};

const eurCents = (c: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(c / 100)} €`;

type Params = { params: Promise<{ tenant: string; token: string }> };

export default async function OwnerPortal({ params }: Params) {
  const { tenant: slug, token } = await params;
  const [tenant, portal] = await Promise.all([fetchTenant(slug), fetchPortal(slug, token)]);
  if (!tenant || !portal) notFound();

  return (
    <div
      className="rt-root"
      data-theme={tenant.brandConfig.theme ?? "dwell"}
      style={{ minHeight: "100vh" }}
    >
      <header className="rt-topbar">
        <div className="rt-wrap rt-topbar__inner">
          <span className="rt-topbar__brand">{tenant.name}</span>
          <span className="rt-eyebrow" style={{ margin: 0 }}>
            Portal del propietario
          </span>
        </div>
      </header>

      <section className="rt-section" style={{ borderTop: "none" }}>
        <div className="rt-wrap">
          <div className="rt-eyebrow">Hola, {portal.owner.name}</div>
          <h1 className="rt-section-title">
            {portal.properties.length === 1
              ? "Así va tu inmueble."
              : "Así van tus inmuebles."}
          </h1>

          {/* aviso de cobros pendientes */}
          {portal.summary.pendingPayments > 0 ? (
            <div className="rt-portal__alert" role="status">
              <strong>
                {portal.summary.pendingPayments === 1
                  ? "Hay 1 mes pendiente de cobro."
                  : `Hay ${portal.summary.pendingPayments} meses pendientes de cobro.`}
              </strong>
              <span>Tu inmobiliaria está al tanto.</span>
            </div>
          ) : null}

          {/* resumen agregado del año (solo si hay actividad económica) */}
          {portal.summary.collectedThisYearCents > 0 ||
          portal.summary.expensesThisYearCents > 0 ? (
            <div className="rt-portal__summary">
              <div className="rt-detail__facts">
                <div>
                  <div className="rt-detail__fact-k">Cobrado este año</div>
                  <div className="rt-detail__fact-v">
                    {eurCents(portal.summary.collectedThisYearCents)}
                  </div>
                </div>
                <div>
                  <div className="rt-detail__fact-k">Gastos este año</div>
                  <div className="rt-detail__fact-v">
                    {eurCents(portal.summary.expensesThisYearCents)}
                  </div>
                </div>
                <div>
                  <div className="rt-detail__fact-k">Neto este año</div>
                  <div className="rt-detail__fact-v">
                    {eurCents(portal.summary.netThisYearCents)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {portal.properties.length === 0 ? (
            <p style={{ color: "var(--tenant-muted)", maxWidth: "48ch" }}>
              Aún no hay inmuebles asociados a tu cuenta. Habla con {tenant.name} si crees que
              es un error.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "var(--tenant-sp-6)" }}>
              {portal.properties.map((p) => (
                <article key={p.id} className="rt-portal__card">
                  {p.photo ? (
                    <img className="rt-portal__photo" src={p.photo} alt={p.title} />
                  ) : (
                    <div className="rt-portal__photo" role="img" aria-label={p.title} />
                  )}

                  <div className="rt-portal__body">
                    <h2 className="rt-portal__title">
                      <a
                        href={`/portal/${token}/${p.id}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {p.title}
                      </a>
                    </h2>
                    <div className="rt-portal__chips">
                      <span
                        className={`rt-portal__chip${p.status === "published" ? " rt-portal__chip--live" : ""}`}
                      >
                        {STATUS_LABEL[p.status]}
                      </span>
                      <span className="rt-portal__chip">{OPERATION_LABELS[p.operation]}</span>
                      {p.city ? <span className="rt-portal__chip">{p.city}</span> : null}
                    </div>

                    {/* tarjeta COMPACTA: las cifras clave; todo lo demás vive
                        en el detalle con tabs (/portal/<token>/<inmueble>) */}
                    <div className="rt-detail__facts" style={{ marginTop: 0 }}>
                      <div>
                        <div className="rt-detail__fact-k">Precio</div>
                        <div className="rt-detail__fact-v">
                          {p.price != null
                            ? `${new Intl.NumberFormat("es-ES").format(p.price)} €${p.operation === "rent" ? "/mes" : ""}`
                            : "—"}
                        </div>
                      </div>
                      {p.rental ? (
                        <div>
                          <div className="rt-detail__fact-k">Neto este año</div>
                          <div className="rt-detail__fact-v">
                            {eurCents(p.rental.collectedThisYear * 100 - p.expensesThisYearCents)}
                          </div>
                        </div>
                      ) : null}
                      <div>
                        <div className="rt-detail__fact-k">Próx. visitas</div>
                        <div className="rt-detail__fact-v">{p.upcomingVisits.length}</div>
                      </div>
                      <div>
                        <div className="rt-detail__fact-k">Interesados</div>
                        <div className="rt-detail__fact-v">{p.interested}</div>
                      </div>
                    </div>

                    <a className="rt-btn" href={`/portal/${token}/${p.id}`}>
                      Ver detalle completo
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <SiteFooter tenant={tenant} homePrefix="/" />
    </div>
  );
}
