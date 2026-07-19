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

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

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
                    <h2 className="rt-portal__title">{p.title}</h2>
                    <div className="rt-portal__chips">
                      <span
                        className={`rt-portal__chip${p.status === "published" ? " rt-portal__chip--live" : ""}`}
                      >
                        {STATUS_LABEL[p.status]}
                      </span>
                      <span className="rt-portal__chip">{OPERATION_LABELS[p.operation]}</span>
                      {p.city ? <span className="rt-portal__chip">{p.city}</span> : null}
                    </div>

                    <div className="rt-detail__facts" style={{ marginTop: 0 }}>
                      <div>
                        <div className="rt-detail__fact-k">Precio</div>
                        <div className="rt-detail__fact-v">
                          {p.price != null
                            ? `${new Intl.NumberFormat("es-ES").format(p.price)} €${p.operation === "rent" ? "/mes" : ""}`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="rt-detail__fact-k">Visitas hechas</div>
                        <div className="rt-detail__fact-v">{p.visitsDone}</div>
                      </div>
                      <div>
                        <div className="rt-detail__fact-k">Interesados</div>
                        <div className="rt-detail__fact-v">{p.interested}</div>
                      </div>
                    </div>

                    <div className="rt-eyebrow" style={{ marginBottom: 0 }}>
                      Próximas visitas
                    </div>
                    {p.upcomingVisits.length > 0 ? (
                      <div>
                        {p.upcomingVisits.map((v) => (
                          <div key={v.at} className="rt-portal__visit">
                            <span>{fmtWhen(v.at)}</span>
                            <span className="rt-portal__visit-status">
                              {v.status === "requested" ? "Por confirmar" : "Confirmada"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p
                        style={{
                          color: "var(--tenant-muted)",
                          fontSize: 14,
                          margin: "var(--tenant-sp-3) 0 0",
                        }}
                      >
                        Sin visitas programadas ahora mismo — te avisamos en cuanto entren.
                      </p>
                    )}
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
