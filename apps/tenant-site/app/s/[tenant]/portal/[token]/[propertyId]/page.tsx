import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OPERATION_LABELS } from "@rep/ui-tenant";
import { fetchPortalProperty, fetchTenant } from "@/lib/tenant";
import { SiteFooter } from "../../../SiteFooter";
import { PortalChart } from "../PortalChart";
import { SettlementView } from "../../../SettlementView";
import { PortalTabs } from "./PortalTabs";

// Detalle de un inmueble del portal del propietario: toda la información en
// tabs (Resumen / Cobros / Gastos / Visitas) para no apelotonar la portada.

export const metadata: Metadata = {
  title: "Detalle del inmueble",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  draft: "En preparación",
  published: "Publicado",
  archived: "Archivado",
  sold: "Vendido",
};
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
const MONTH_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const eurCents = (c: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(c / 100)} €`;
const eur = (n: number) => `${new Intl.NumberFormat("es-ES").format(n)} €`;
const periodLabel = (p: string) => `${MONTH_LONG[Number(p.slice(5)) - 1]} ${p.slice(0, 4)}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });

type Params = { params: Promise<{ tenant: string; token: string; propertyId: string }> };

export default async function PortalPropertyDetail({ params }: Params) {
  const { tenant: slug, token, propertyId } = await params;
  const [tenant, detail] = await Promise.all([
    fetchTenant(slug),
    fetchPortalProperty(slug, token, propertyId),
  ]);
  if (!tenant || !detail) notFound();

  const { property: p, rental } = detail;
  const netThisYearCents =
    (rental?.collectedThisYearCents ?? 0) -
    detail.expenses
      .filter((e) => e.date.startsWith(String(new Date().getFullYear())))
      .reduce((a, e) => a + e.amountCents, 0);

  const resumen = (
    <div>
      <div className="rt-detail__facts" style={{ borderTop: "none", paddingTop: 0 }}>
        <div>
          <div className="rt-detail__fact-k">Precio</div>
          <div className="rt-detail__fact-v">
            {p.price != null ? `${eur(p.price)}${p.operation === "rent" ? "/mes" : ""}` : "—"}
          </div>
        </div>
        {rental ? (
          <>
            <div>
              <div className="rt-detail__fact-k">Cobrado este año</div>
              <div className="rt-detail__fact-v">{eurCents(rental.collectedThisYearCents)}</div>
            </div>
            <div>
              <div className="rt-detail__fact-k">Neto este año</div>
              <div className="rt-detail__fact-v">{eurCents(netThisYearCents)}</div>
            </div>
          </>
        ) : null}
        <div>
          <div className="rt-detail__fact-k">Interesados</div>
          <div className="rt-detail__fact-v">{p.interested}</div>
        </div>
      </div>
      <PortalChart monthly={detail.monthly} />
    </div>
  );

  const cobros = rental ? (
    <div>
      <div className="rt-detail__facts" style={{ borderTop: "none", paddingTop: 0 }}>
        <div>
          <div className="rt-detail__fact-k">{rental.byRoom ? "Renta total" : "Renta"}</div>
          <div className="rt-detail__fact-v">{eur(rental.monthlyRent)}/mes</div>
        </div>
        <div>
          <div className="rt-detail__fact-k">Alquilado desde</div>
          <div className="rt-detail__fact-v">
            {new Date(rental.since).toLocaleDateString("es-ES", { month: "short", year: "numeric" })}
          </div>
        </div>
        {rental.byRoom ? (
          <div>
            <div className="rt-detail__fact-k">Habitaciones</div>
            <div className="rt-detail__fact-v">{rental.rooms.length}</div>
          </div>
        ) : null}
      </div>

      {rental.rooms.map((room, i) => (
        <div key={room.label ?? `room-${i}`} style={{ marginTop: rental.byRoom ? "var(--tenant-sp-5)" : 0 }}>
          {rental.byRoom ? (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "var(--tenant-sp-3)",
                marginBottom: "var(--tenant-sp-2)",
              }}
            >
              <strong>{room.label ?? "Piso entero"}</strong>
              <span style={{ color: "var(--tenant-muted)" }}>
                {eur(room.monthlyRent)}/mes · cobrado {eurCents(room.collectedThisYearCents)}
                {room.status === "ended" ? " · finalizado" : ""}
              </span>
            </div>
          ) : null}
          {room.payments.length === 0 ? (
            <p style={{ color: "var(--tenant-muted)" }}>Aún no hay cobros registrados.</p>
          ) : (
            <div className="rt-table-scroll"><table className="rt-table">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Importe</th>
                  <th>Estado</th>
                  <th>Pagado el</th>
                </tr>
              </thead>
              <tbody>
                {room.payments.map((pay) => (
                  <tr key={pay.period}>
                    <td style={{ textTransform: "capitalize" }}>{periodLabel(pay.period)}</td>
                    <td>{eur(pay.amount)}</td>
                    <td>
                      <span
                        className={`rt-portal__chip${pay.status === "paid" ? " rt-portal__chip--live" : ""}`}
                      >
                        {pay.status === "paid" ? "Cobrado" : "Pendiente"}
                      </span>
                    </td>
                    <td style={{ color: "var(--tenant-muted)" }}>
                      {pay.paidAt ? fmtDate(pay.paidAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      ))}
    </div>
  ) : (
    <p style={{ color: "var(--tenant-muted)" }}>Este inmueble no tiene contrato de alquiler.</p>
  );

  const gastos = (
    <div>
      {detail.expensesByCategory.length > 0 ? (
        <div className="rt-portal__chips" style={{ marginBottom: "var(--tenant-sp-4)" }}>
          {detail.expensesByCategory.map((c) => (
            <span key={c.category} className="rt-portal__chip">
              {EXPENSE_LABELS[c.category] ?? c.category} · {eurCents(c.totalCents)}
            </span>
          ))}
        </div>
      ) : null}
      {detail.expenses.length === 0 ? (
        <p style={{ color: "var(--tenant-muted)" }}>Sin gastos registrados.</p>
      ) : (
        <div className="rt-table-scroll"><table className="rt-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Categoría</th>
              <th>Concepto</th>
              <th>Importe</th>
              <th>Factura</th>
            </tr>
          </thead>
          <tbody>
            {detail.expenses.map((e) => (
              <tr key={`${e.date}-${e.category}-${e.amountCents}`}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDate(e.date)}</td>
                <td>{EXPENSE_LABELS[e.category] ?? e.category}</td>
                <td style={{ color: "var(--tenant-muted)" }}>{e.concept ?? "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>{eurCents(e.amountCents)}</td>
                <td>
                  {e.fileUrl ? (
                    <a href={e.fileUrl} target="_blank" rel="noreferrer">
                      Ver factura
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );

  const visitas = (
    <div>
      <div className="rt-eyebrow">Próximas</div>
      {detail.visits.upcoming.length === 0 ? (
        <p style={{ color: "var(--tenant-muted)", marginTop: "var(--tenant-sp-2)" }}>
          Sin visitas programadas ahora mismo.
        </p>
      ) : (
        detail.visits.upcoming.map((v) => (
          <div key={v.at} className="rt-portal__visit">
            <span style={{ textTransform: "capitalize" }}>{fmtWhen(v.at)}</span>
            <span className="rt-portal__visit-status">
              {v.status === "requested" ? "Por confirmar" : "Confirmada"}
            </span>
          </div>
        ))
      )}
      <div className="rt-eyebrow" style={{ marginTop: "var(--tenant-sp-5)" }}>
        Historial
      </div>
      {detail.visits.past.length === 0 ? (
        <p style={{ color: "var(--tenant-muted)", marginTop: "var(--tenant-sp-2)" }}>
          Aún sin visitas pasadas.
        </p>
      ) : (
        detail.visits.past.map((v) => (
          <div key={v.at} className="rt-portal__visit">
            <span style={{ textTransform: "capitalize" }}>{fmtWhen(v.at)}</span>
            <span className="rt-portal__visit-status">
              {v.status === "done" ? "Hecha" : v.status === "cancelled" ? "Cancelada" : "Pasada"}
            </span>
          </div>
        ))
      )}
    </div>
  );

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
          <Link className="rt-detail__back" href={`/portal/${token}`}>
            ← Volver a tus inmuebles
          </Link>

          <h1 className="rt-portal__title" style={{ fontSize: "clamp(28px, 5vw, 40px)" }}>
            {p.title}
          </h1>
          <div className="rt-portal__chips">
            <span
              className={`rt-portal__chip${p.status === "published" ? " rt-portal__chip--live" : ""}`}
            >
              {STATUS_LABEL[p.status]}
            </span>
            <span className="rt-portal__chip">{OPERATION_LABELS[p.operation]}</span>
            {p.city ? <span className="rt-portal__chip">{p.city}</span> : null}
          </div>

          <PortalTabs
            tabs={[
              { id: "resumen", label: "Resumen", content: resumen },
              { id: "cobros", label: "Cobros", content: cobros },
              // Reparto de gastos entre inquilinos — solo si la inmobiliaria lo hace visible.
              ...(detail.settlement
                ? [{ id: "reparto", label: "Reparto", content: <SettlementView settlement={detail.settlement} /> }]
                : []),
              { id: "gastos", label: "Gastos", content: gastos },
              { id: "visitas", label: "Visitas", content: visitas },
            ]}
          />
        </div>
      </section>

      <SiteFooter tenant={tenant} homePrefix="/" />
    </div>
  );
}
