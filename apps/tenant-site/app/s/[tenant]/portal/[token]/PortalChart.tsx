// Gráfico de barras mensual ingresos vs gastos (año en curso). SVG puro
// renderizado en servidor: sin JS de cliente; el hover usa <title> nativo.
// Identidad de serie por modo de relleno (sólida vs hueca) — ver base.css.
import type { PortalMonthly } from "@/lib/tenant";

const MONTHS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const eur = (cents: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(cents / 100)} €`;

export function PortalChart({ monthly }: { monthly: PortalMonthly[] }) {
  const max = Math.max(...monthly.map((m) => Math.max(m.incomeCents, m.expenseCents)));
  if (max <= 0) return null;

  // Geometría: 12 grupos de 2 barras. Coordenadas en un viewBox fijo.
  const W = 600;
  const H = 170;
  const plotH = 130;
  const top = 12;
  const groupW = W / 12;
  const barW = Math.min(14, groupW / 2 - 4);
  const y = (v: number) => top + plotH - (v / max) * plotH;

  return (
    <div className="rt-chart">
      <div className="rt-chart__legend" aria-hidden="true">
        <span>
          <i className="rt-chart__swatch" /> Ingresos
        </span>
        <span>
          <i className="rt-chart__swatch rt-chart__swatch--expense" /> Gastos
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Ingresos y gastos por mes del año en curso"
      >
        {/* eje base */}
        <line className="rt-chart__axis" x1="0" y1={top + plotH} x2={W} y2={top + plotH} />
        {monthly.map((m, i) => {
          const cx = i * groupW + groupW / 2;
          const hasData = m.incomeCents > 0 || m.expenseCents > 0;
          return (
            <g key={m.month}>
              {m.incomeCents > 0 ? (
                <rect
                  className="rt-chart__bar--income"
                  x={cx - barW - 1}
                  y={y(m.incomeCents)}
                  width={barW}
                  height={top + plotH - y(m.incomeCents)}
                  rx="2"
                >
                  <title>{`${MONTHS[i]} — Ingresos: ${eur(m.incomeCents)}`}</title>
                </rect>
              ) : null}
              {m.expenseCents > 0 ? (
                <rect
                  className="rt-chart__bar--expense"
                  x={cx + 1}
                  y={y(m.expenseCents)}
                  width={barW}
                  height={top + plotH - y(m.expenseCents)}
                  rx="2"
                >
                  <title>{`${MONTHS[i]} — Gastos: ${eur(m.expenseCents)}`}</title>
                </rect>
              ) : null}
              <text
                className="rt-chart__label"
                x={cx}
                y={H - 4}
                textAnchor="middle"
                style={hasData ? undefined : { opacity: 0.5 }}
              >
                {MONTHS[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
