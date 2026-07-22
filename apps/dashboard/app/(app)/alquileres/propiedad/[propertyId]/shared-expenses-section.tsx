"use client";

import { Check, Copy, Download, Eye, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Select, Switch } from "@rep/ui";
import {
  api,
  type PropertySettlement,
  type ShareConfig,
  type SharedExpenseType,
} from "@/lib/api";
import { TENANT_SITE_URL } from "@/lib/config";

const eurCents = (c: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(c / 100)} €`;

const TYPE_LABEL: Record<SharedExpenseType, string> = {
  electricity: "Luz",
  water: "Agua",
  gas: "Gas",
  internet: "Internet",
  community: "Comunidad",
  heating: "Calefacción",
  other: "Otros",
};
const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
};

// Gastos compartidos del piso (luz, agua, …) repartidos entre los inquilinos por
// días de solape con el periodo de la factura, + liquidación por inquilino
// (Alquiler + gastos = Total). Igual que el Excel del cliente.
export function SharedExpensesSection({ slug, propertyId }: { slug: string; propertyId: string }) {
  const [data, setData] = useState<PropertySettlement | null>(null);
  const [share, setShare] = useState<ShareConfig | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [settlement, shareCfg] = await Promise.all([
        api.sharedExpenses.settlement(slug, propertyId),
        api.sharedExpenses.getShare(slug, propertyId),
      ]);
      setData(settlement);
      setShare(shareCfg);
    } catch {
      setError("No se pudo cargar el reparto de gastos.");
    }
  }, [slug, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateShare(patch: { ownerVisible?: boolean; tenantShared?: boolean }) {
    setError(null);
    try {
      setShare(await api.sharedExpenses.setShare(slug, propertyId, patch));
    } catch {
      setError("No se pudo cambiar la visibilidad.");
    }
  }

  const tenantLink = share?.tenantToken
    ? `${TENANT_SITE_URL}/liquidacion/${share.tenantToken}?__tenant=${slug}`
    : null;

  async function copyLink() {
    if (!tenantLink) return;
    await navigator.clipboard.writeText(tenantLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.sharedExpenses.remove(slug, id);
      await load();
    } catch {
      setError("No se pudo borrar el gasto.");
    }
  }

  async function downloadPdf() {
    setError(null);
    try {
      const blob = await api.sharedExpenses.settlementPdf(slug, propertyId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setError("No se pudo generar el PDF.");
    }
  }

  if (!data) {
    return error ? <p className="du-alert">{error}</p> : null;
  }

  // Columnas de tipo presentes (para la tabla de liquidación).
  const typesPresent = (Object.keys(data.totalsByType) as SharedExpenseType[]).sort((a, b) =>
    TYPE_LABEL[a].localeCompare(TYPE_LABEL[b], "es"),
  );
  const sumRent = data.tenants.reduce((a, t) => a + t.monthlyRentCents, 0);
  const sumTotal = data.tenants.reduce((a, t) => a + t.totalCents, 0);

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-4)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--ui-sp-3)" }}>
        <h2 className="du-h3" style={{ margin: 0 }}>
          Gastos compartidos y reparto
        </h2>
        <div style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
          {data.expenses.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => void downloadPdf()}>
              <Download size={15} />
              PDF
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} />
            Añadir factura
          </Button>
        </div>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      {showForm ? (
        <ExpenseForm
          slug={slug}
          propertyId={propertyId}
          onSaved={() => {
            setShowForm(false);
            void load();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {/* Compartir — LO CONTROLA LA INMOBILIARIA */}
      {share ? (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: "var(--ui-sp-3)" }}>
            <Eye size={15} className="du-muted" />
            <strong>Compartir la liquidación</strong>
          </div>
          <div style={{ display: "grid", gap: "var(--ui-sp-3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--ui-sp-3)" }}>
              <div>
                <div style={{ fontWeight: 500 }}>Propietario</div>
                <div className="du-muted" style={{ fontSize: 13 }}>
                  Lo verá en su portal.
                </div>
              </div>
              <Switch
                checked={share.ownerVisible}
                onChange={(v) => void updateShare({ ownerVisible: v })}
                label="Visible para el propietario"
              />
            </div>
            <div style={{ borderTop: "1px solid var(--ui-border)", paddingTop: "var(--ui-sp-3)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--ui-sp-3)" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>Inquilinos</div>
                  <div className="du-muted" style={{ fontSize: 13 }}>
                    Enlace público que puedes pasarles; lo revocas cuando quieras.
                  </div>
                </div>
                <Switch
                  checked={!!share.tenantToken}
                  onChange={(v) => void updateShare({ tenantShared: v })}
                  label="Compartir con inquilinos"
                />
              </div>
              {tenantLink ? (
                <div style={{ display: "flex", gap: "var(--ui-sp-2)", marginTop: "var(--ui-sp-3)" }}>
                  <Input readOnly value={tenantLink} onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="outline" size="sm" onClick={() => void copyLink()}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {/* Liquidación por inquilino */}
      {data.tenants.length === 0 ? (
        <Card>
          <p className="du-muted" style={{ margin: 0 }}>
            Este piso aún no tiene contratos por habitación.
          </p>
        </Card>
      ) : (
        <Card padded={false}>
          <div style={{ padding: "var(--ui-sp-3) var(--ui-sp-4)", borderBottom: "1px solid var(--ui-border)" }}>
            <strong>Liquidación</strong>{" "}
            <span className="du-muted" style={{ fontSize: 13 }}>
              — lo que paga cada inquilino (renta + su parte de los gastos)
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="du-table">
              <thead>
                <tr>
                  <th>Inquilino</th>
                  <th style={{ textAlign: "right" }}>Alquiler</th>
                  {typesPresent.map((t) => (
                    <th key={t} style={{ textAlign: "right" }}>
                      {TYPE_LABEL[t]}
                    </th>
                  ))}
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.tenants.map((t) => (
                  <tr key={t.rentalId}>
                    <td>
                      <span style={{ fontWeight: 500 }}>{t.renterName}</span>
                      {t.roomName ? (
                        <span className="du-muted" style={{ fontSize: 12 }}>
                          {" "}
                          · {t.roomName}
                        </span>
                      ) : null}
                      {t.status === "ended" ? (
                        <Badge variant="muted" style={{ marginLeft: 6 }}>
                          Finalizado
                        </Badge>
                      ) : null}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eurCents(t.monthlyRentCents)}</td>
                    {typesPresent.map((ty) => (
                      <td key={ty} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {t.byType[ty] ? eurCents(t.byType[ty]!) : "—"}
                      </td>
                    ))}
                    <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 }}>
                      {eurCents(t.totalCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--ui-border)" }}>
                  <td style={{ fontWeight: 600 }}>Total</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eurCents(sumRent)}</td>
                  {typesPresent.map((t) => (
                    <td key={t} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {eurCents(data.totalsByType[t] ?? 0)}
                    </td>
                  ))}
                  <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>
                    {eurCents(sumTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Detalle de facturas con su reparto */}
      {data.expenses.length > 0 ? (
        <div style={{ display: "grid", gap: "var(--ui-sp-3)" }}>
          {data.expenses.map((e) => (
            <Card key={e.id}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--ui-sp-3)" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {TYPE_LABEL[e.type]}
                    {e.concept ? <span className="du-muted"> · {e.concept}</span> : null}
                  </div>
                  <div className="du-muted" style={{ fontSize: 13 }}>
                    {fmtDay(e.periodStart)} – {fmtDay(e.periodEnd)} · {eurCents(e.amountCents)}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void remove(e.id)} aria-label="Borrar factura">
                  <Trash2 size={15} />
                </Button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "6px var(--ui-sp-4)",
                  marginTop: "var(--ui-sp-3)",
                  fontSize: 13,
                }}
              >
                {e.shares.map((s) => (
                  <div key={s.rentalId} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>
                      {s.renterName}
                      <span className="du-muted"> · {s.days} d</span>
                    </span>
                    <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{eurCents(s.cents)}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ExpenseForm({
  slug,
  propertyId,
  onSaved,
  onCancel,
}: {
  slug: string;
  propertyId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<SharedExpenseType>("electricity");
  const [concept, setConcept] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (periodEnd < periodStart) {
      setError("El fin del periodo no puede ser anterior al inicio.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.sharedExpenses.create(slug, {
        propertyId,
        type,
        concept: concept || undefined,
        periodStart,
        periodEnd,
        amount: Number(amount),
      });
      onSaved();
    } catch {
      setError("No se pudo guardar la factura. Revisa los datos.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} style={{ display: "grid", gap: "var(--ui-sp-4)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "var(--ui-sp-4)",
            alignItems: "end",
          }}
        >
          <div>
            <Label htmlFor="se-type">Tipo</Label>
            <Select id="se-type" value={type} onChange={(e) => setType(e.target.value as SharedExpenseType)}>
              {(Object.keys(TYPE_LABEL) as SharedExpenseType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="se-concept">Concepto (opcional)</Label>
            <Input id="se-concept" placeholder="Iberdrola enero" value={concept} onChange={(e) => setConcept(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="se-start">Inicio periodo</Label>
            <Input id="se-start" type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="se-end">Fin periodo</Label>
            <Input id="se-end" type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="se-amount">Importe (€)</Label>
            <Input id="se-amount" type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>

        {error ? <p className="du-alert">{error}</p> : null}

        <div style={{ display: "flex", gap: "var(--ui-sp-3)" }}>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Guardando…" : "Guardar y repartir"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
