import type { PropertySettlement, SettlementType } from "@/lib/tenant";

const eurCents = (c: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(c / 100)} €`;

const TYPE_LABEL: Record<SettlementType, string> = {
  electricity: "Luz",
  water: "Agua",
  gas: "Gas",
  internet: "Internet",
  community: "Comunidad",
  heating: "Calefacción",
  other: "Otros",
};
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
};

// Vista de la liquidación de gastos (reparto por inquilino). Presentacional, se
// reusa en el portal del propietario y en la página pública del inquilino.
export function SettlementView({ settlement }: { settlement: PropertySettlement }) {
  const types = (Object.keys(settlement.totalsByType) as SettlementType[]).sort((a, b) =>
    TYPE_LABEL[a].localeCompare(TYPE_LABEL[b], "es"),
  );
  const sumRent = settlement.tenants.reduce((a, t) => a + t.monthlyRentCents, 0);
  const sumTotal = settlement.tenants.reduce((a, t) => a + t.totalCents, 0);

  if (settlement.tenants.length === 0) {
    return <p style={{ color: "var(--tenant-muted)" }}>Aún no hay reparto de gastos.</p>;
  }

  return (
    <div>
      <div className="rt-table-scroll">
        <table className="rt-table">
          <thead>
            <tr>
              <th>Inquilino</th>
              <th style={{ textAlign: "right" }}>Alquiler</th>
              {types.map((t) => (
                <th key={t} style={{ textAlign: "right" }}>
                  {TYPE_LABEL[t]}
                </th>
              ))}
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {settlement.tenants.map((t) => (
              <tr key={t.rentalId}>
                <td>
                  {t.renterName}
                  {t.roomName ? (
                    <span style={{ color: "var(--tenant-muted)" }}> · {t.roomName}</span>
                  ) : null}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eurCents(t.monthlyRentCents)}</td>
                {types.map((ty) => (
                  <td key={ty} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {t.byType[ty] ? eurCents(t.byType[ty]!) : "—"}
                  </td>
                ))}
                <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>
                  {eurCents(t.totalCents)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--tenant-border, rgba(0,0,0,0.15))" }}>
              <td style={{ fontWeight: 600 }}>Total</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eurCents(sumRent)}</td>
              {types.map((t) => (
                <td key={t} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {eurCents(settlement.totalsByType[t] ?? 0)}
                </td>
              ))}
              <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>{eurCents(sumTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {settlement.expenses.length > 0 ? (
        <div style={{ marginTop: "var(--tenant-sp-5)", display: "grid", gap: "var(--tenant-sp-4)" }}>
          {settlement.expenses.map((e) => (
            <div key={e.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--tenant-sp-3)" }}>
                <strong>
                  {TYPE_LABEL[e.type]}
                  {e.concept ? ` · ${e.concept}` : ""}
                </strong>
                <span style={{ fontWeight: 600 }}>{eurCents(e.amountCents)}</span>
              </div>
              <div style={{ color: "var(--tenant-muted)", fontSize: 14 }}>
                {fmtDay(e.periodStart)} – {fmtDay(e.periodEnd)}
              </div>
              <div style={{ display: "grid", gap: 2, marginTop: "var(--tenant-sp-2)" }}>
                {e.shares.map((s) => (
                  <div
                    key={`${e.id}-${s.renterName}`}
                    style={{ display: "flex", justifyContent: "space-between", gap: "var(--tenant-sp-3)", fontSize: 14 }}
                  >
                    <span>
                      {s.renterName}
                      <span style={{ color: "var(--tenant-muted)" }}> · {s.days} días</span>
                    </span>
                    <span style={{ fontWeight: 500 }}>{eurCents(s.cents)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
