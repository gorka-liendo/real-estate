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
                <div key={p.id} className="rt-detail">
                  <div className="rt-detail__main">
                    {p.photo ? (
                      <img
                        className="rt-mosaic__img--placeholder"
                        src={p.photo}
                        alt={p.title}
                        style={{ width: "100%", objectFit: "cover" }}
                      />
                    ) : null}
                    <h2 className="rt-block__title" style={{ marginTop: "var(--tenant-sp-4)" }}>
                      {p.title}
                    </h2>
                    <div className="rt-eyebrow">
                      {OPERATION_LABELS[p.operation]}
                      {p.city ? ` · ${p.city}` : ""} · {STATUS_LABEL[p.status]}
                    </div>

                    <div className="rt-detail__facts">
                      <div>
                        <div className="rt-detail__fact-k">Precio</div>
                        <div className="rt-detail__fact-v">
                          {p.price != null
                            ? `${new Intl.NumberFormat("es-ES").format(p.price)} €`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="rt-detail__fact-k">Visitas hechas</div>
                        <div className="rt-detail__fact-v">{p.visitsDone}</div>
                      </div>
                      <div>
                        <div className="rt-detail__fact-k">Próximas visitas</div>
                        <div className="rt-detail__fact-v">{p.upcomingVisits.length}</div>
                      </div>
                      <div>
                        <div className="rt-detail__fact-k">Interesados</div>
                        <div className="rt-detail__fact-v">{p.interested}</div>
                      </div>
                    </div>

                    {p.upcomingVisits.length > 0 ? (
                      <div className="rt-block">
                        <h3 className="rt-block__title">Próximas visitas</h3>
                        <ul className="rt-features">
                          {p.upcomingVisits.map((v) => (
                            <li key={v.at} className="rt-feature">
                              {fmtWhen(v.at)}
                              {v.status === "requested" ? " · pendiente de confirmar" : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <SiteFooter tenant={tenant} homePrefix="/" />
    </div>
  );
}
