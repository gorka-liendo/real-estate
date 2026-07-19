import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OPERATION_LABELS } from "@rep/ui-tenant";
import { fetchPortal, fetchTenant, type PortalProperty } from "@/lib/tenant";
import { SiteFooter } from "../../SiteFooter";
import { PortalChart } from "./PortalChart";

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

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const EXPENSE_LABELS: Record<string, string> = {
  water: "Agua",
  electricity: "Luz",
  gas: "Gas",
  community: "Comunidad",
  taxes: "Impuestos",
  derrama: "Derrama",
  maintenance: "Mantenimiento",
  insurance: "Seguro",
  other: "Otros",
};

const eurCents = (c: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(c / 100)} €`;

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

                    {p.rental ? (
                      <>
                        <div className="rt-eyebrow" style={{ marginBottom: 0 }}>
                          Rendimiento del alquiler
                        </div>
                        <div className="rt-detail__facts" style={{ marginBottom: "var(--tenant-sp-4)" }}>
                          <div>
                            <div className="rt-detail__fact-k">Renta</div>
                            <div className="rt-detail__fact-v">
                              {new Intl.NumberFormat("es-ES").format(p.rental.monthlyRent)} €/mes
                            </div>
                          </div>
                          <div>
                            <div className="rt-detail__fact-k">Cobrado este año</div>
                            <div className="rt-detail__fact-v">
                              {new Intl.NumberFormat("es-ES").format(p.rental.collectedThisYear)} €
                            </div>
                          </div>
                          <div>
                            <div className="rt-detail__fact-k">Alquilado desde</div>
                            <div className="rt-detail__fact-v">
                              {new Date(p.rental.since).toLocaleDateString("es-ES", {
                                month: "short",
                                year: "numeric",
                              })}
                            </div>
                          </div>
                        </div>
                        {p.rental.months.length > 0 ? (
                          <div className="rt-portal__chips">
                            {p.rental.months.map((m) => (
                              <span
                                key={m.period}
                                className={`rt-portal__chip${m.status === "paid" ? " rt-portal__chip--live" : ""}`}
                              >
                                {MONTH_SHORT[Number(m.period.slice(5)) - 1]}{" "}
                                {m.status === "paid" ? "cobrado" : "pendiente"}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    <PortalChart monthly={p.monthly} />

                    {p.expensesThisYearCents > 0 || p.latestExpenses.length > 0 ? (
                      <>
                        <div className="rt-eyebrow" style={{ marginBottom: 0 }}>
                          Gastos y facturas
                        </div>
                        <div className="rt-detail__facts" style={{ marginBottom: "var(--tenant-sp-3)" }}>
                          <div>
                            <div className="rt-detail__fact-k">Gastos este año</div>
                            <div className="rt-detail__fact-v">{eurCents(p.expensesThisYearCents)}</div>
                          </div>
                          {p.rental ? (
                            <div>
                              <div className="rt-detail__fact-k">Neto este año</div>
                              <div className="rt-detail__fact-v">
                                {eurCents(p.rental.collectedThisYear * 100 - p.expensesThisYearCents)}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div>
                          {p.latestExpenses.map((e) => (
                            <div key={`${e.date}-${e.category}-${e.amountCents}`} className="rt-portal__visit">
                              <span>
                                {new Date(e.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                                {" · "}
                                {EXPENSE_LABELS[e.category] ?? e.category}
                                {e.concept ? ` · ${e.concept}` : ""}
                              </span>
                              <span style={{ whiteSpace: "nowrap" }}>
                                {eurCents(e.amountCents)}
                                {e.fileUrl ? (
                                  <>
                                    {" · "}
                                    <a href={e.fileUrl} target="_blank" rel="noreferrer">
                                      Ver factura
                                    </a>
                                  </>
                                ) : null}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}

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
