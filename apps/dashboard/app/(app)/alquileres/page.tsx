"use client";

import { Paperclip, Plus, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Select } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import {
  api,
  ApiError,
  type Client,
  type Expense,
  type ExpenseCategory,
  type Property,
  type Rental,
} from "@/lib/api";

const eur = (n: number) => `${new Intl.NumberFormat("es-ES").format(n)} €`;
const eurCents = (c: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(c / 100)} €`;

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
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

// Últimos N periodos "YYYY-MM" acabando en el mes actual.
function lastPeriods(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const periodLabel = (p: string) => `${MONTH_SHORT[Number(p.slice(5)) - 1]} ${p.slice(2, 4)}`;

function AlquileresInner({ slug }: { slug: string }) {
  const { hasModule } = useWorkspace();
  const [items, setItems] = useState<Rental[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [propsList, setPropsList] = useState<Property[]>([]);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api.rentals.list(slug)).rentals);
      if (hasModule("properties")) {
        const { properties } = await api.properties.list(slug);
        setPropsList(properties);
        setTitles(Object.fromEntries(properties.map((p) => [p.id, p.title])));
      }
      if (hasModule("clients")) {
        setClientsList((await api.clients.list(slug)).clients);
      }
    } catch {
      setError("No se pudieron cargar los alquileres.");
    }
  }, [slug, hasModule]);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePayment(r: Rental, period: string) {
    setError(null);
    const current = r.payments.find((p) => p.period.startsWith(period))?.status;
    const next = current === "paid" ? "pending" : "paid";
    try {
      await api.rentals.setPayment(slug, r.id, period, next);
      await load();
    } catch {
      setError("No se pudo registrar el cobro.");
    }
  }

  async function endRental(r: Rental) {
    setError(null);
    try {
      await api.rentals.update(slug, r.id, { status: "ended" });
      await load();
    } catch {
      setError("No se pudo finalizar el contrato.");
    }
  }

  const periods = lastPeriods(3);

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="du-h1">Alquileres</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} />
          Nuevo contrato
        </Button>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      {showForm ? (
        <NewRentalForm
          slug={slug}
          propsList={propsList}
          clientsList={clientsList}
          onCreated={() => {
            setShowForm(false);
            void load();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      <Card padded={false}>
        {items === null ? (
          <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
            Cargando…
          </p>
        ) : items.length === 0 ? (
          <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
            Sin contratos de alquiler. Crea el primero con “Nuevo contrato”.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="du-table">
              <thead>
                <tr>
                  <th>Inmueble</th>
                  <th>Inquilino</th>
                  <th>Renta</th>
                  <th>Cobros (clic para marcar)</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{titles[r.propertyId] ?? "—"}</td>
                    <td>
                      {r.renterName}
                      <div className="du-muted" style={{ fontSize: 12 }}>
                        desde {new Date(r.startDate).toLocaleDateString("es-ES")}
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{eur(r.monthlyRent)}/mes</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.status === "active"
                        ? periods.map((period) => {
                            const pay = r.payments.find((p) => p.period.startsWith(period));
                            return (
                              <Button
                                key={period}
                                variant="ghost"
                                size="sm"
                                onClick={() => void togglePayment(r, period)}
                                aria-label={`Marcar ${periodLabel(period)} como ${pay?.status === "paid" ? "pendiente" : "cobrado"}`}
                              >
                                <Badge variant={pay?.status === "paid" ? "success" : "muted"}>
                                  {periodLabel(period)} {pay?.status === "paid" ? "✓" : pay ? "!" : "·"}
                                </Badge>
                              </Button>
                            );
                          })
                        : null}
                    </td>
                    <td>
                      <Badge variant={r.status === "active" ? "success" : "default"}>
                        {r.status === "active" ? "Activo" : "Finalizado"}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {r.status === "active" ? (
                        <Button variant="ghost" size="sm" onClick={() => void endRental(r)}>
                          <Square size={13} />
                          Finalizar
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ExpensesCard slug={slug} propsList={propsList} />
    </div>
  );
}

// Gastos y facturas por inmueble: la agencia sube la factura categorizada
// (agua, luz, comunidad, derramas…) y el propietario la ve en su portal.
function ExpensesCard({ slug, propsList }: { slug: string; propsList: Property[] }) {
  const [propertyId, setPropertyId] = useState("");
  const [items, setItems] = useState<Expense[] | null>(null);
  const [category, setCategory] = useState<ExpenseCategory>("water");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [concept, setConcept] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pid: string) => {
    if (!pid) {
      setItems(null);
      return;
    }
    try {
      setItems((await api.expenses.list(slug, pid)).expenses);
    } catch {
      setError("No se pudieron cargar los gastos.");
    }
  }, [slug]);

  useEffect(() => {
    void load(propertyId);
  }, [propertyId, load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.expenses.create(slug, {
        propertyId,
        category,
        amount,
        expenseDate,
        concept: concept || undefined,
        file,
      });
      setAmount("");
      setConcept("");
      setFile(null);
      await load(propertyId);
    } catch (err) {
      setError(
        err instanceof ApiError && err.message === "invalid_file_type"
          ? "Archivo no admitido: sube un PDF o una imagen de la factura."
          : "No se pudo guardar el gasto. Revisa los datos.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    await api.expenses.remove(slug, id);
    await load(propertyId);
  }

  return (
    <Card>
      <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
        Gastos y facturas
      </h2>

      <div style={{ maxWidth: 360, marginBottom: "var(--ui-sp-4)" }}>
        <Label htmlFor="e-prop">Inmueble</Label>
        <Select id="e-prop" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Elegir inmueble…</option>
          {propsList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
      </div>

      {propertyId ? (
        <>
          <form
            onSubmit={submit}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "var(--ui-sp-4)",
              alignItems: "end",
              marginBottom: "var(--ui-sp-5)",
            }}
          >
            <div>
              <Label htmlFor="e-cat">Categoría</Label>
              <Select id="e-cat" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="e-amount">Importe (€)</Label>
              <Input
                id="e-amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="e-date">Fecha</Label>
              <Input id="e-date" type="date" required value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="e-concept">Concepto</Label>
              <Input id="e-concept" placeholder="Factura Iberdrola mayo" value={concept} onChange={(e) => setConcept(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="e-file">Factura (PDF/imagen)</Label>
              <Input
                id="e-file"
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando…" : "Añadir gasto"}
            </Button>
          </form>

          {error ? <p className="du-alert">{error}</p> : null}

          {items === null ? null : items.length === 0 ? (
            <p className="du-muted">Sin gastos registrados para este inmueble.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="du-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Categoría</th>
                    <th>Concepto</th>
                    <th>Importe</th>
                    <th>Factura</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {new Date(e.expenseDate).toLocaleDateString("es-ES")}
                      </td>
                      <td>
                        <Badge variant="default">{EXPENSE_CATEGORY_LABELS[e.category]}</Badge>
                      </td>
                      <td>{e.concept ?? "—"}</td>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>{eurCents(e.amountCents)}</td>
                      <td>
                        {e.fileUrl ? (
                          <a href={e.fileUrl} target="_blank" rel="noreferrer" className="du-muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <Paperclip size={14} />
                            {e.fileName ?? "Ver"}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Button variant="ghost" size="sm" onClick={() => void remove(e.id)} aria-label="Eliminar gasto">
                          <Trash2 size={15} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </Card>
  );
}

function NewRentalForm({
  slug,
  propsList,
  clientsList,
  onCreated,
  onCancel,
}: {
  slug: string;
  propsList: Property[];
  clientsList: Client[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [renterClientId, setRenterClientId] = useState("");
  const [renterName, setRenterName] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.rentals.create(slug, {
        propertyId,
        renterClientId: renterClientId || undefined,
        renterName,
        monthlyRent: Number(monthlyRent),
        startDate,
      });
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Ese inmueble ya tiene un contrato activo. Finalízalo antes de abrir otro."
          : "No se pudo crear el contrato. Revisa los datos.",
      );
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
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--ui-sp-4)",
          }}
        >
          <div>
            <Label htmlFor="r-prop">Inmueble</Label>
            <Select id="r-prop" required value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Elegir…</option>
              {propsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="r-client">Inquilino (cliente, opcional)</Label>
            <Select
              id="r-client"
              value={renterClientId}
              onChange={(e) => {
                setRenterClientId(e.target.value);
                const c = clientsList.find((x) => x.id === e.target.value);
                if (c && !renterName) setRenterName(c.name);
              }}
            >
              <option value="">— Sin vincular —</option>
              {clientsList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="r-name">Nombre del inquilino</Label>
            <Input id="r-name" required value={renterName} onChange={(e) => setRenterName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="r-rent">Renta (€/mes)</Label>
            <Input
              id="r-rent"
              type="number"
              min={1}
              required
              value={monthlyRent}
              onChange={(e) => setMonthlyRent(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="r-start">Inicio</Label>
            <Input id="r-start" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>

        {error ? <p className="du-alert">{error}</p> : null}

        <div style={{ display: "flex", gap: "var(--ui-sp-3)" }}>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Guardando…" : "Crear contrato"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function AlquileresPage() {
  const { selected } = useWorkspace();
  const loading = useRequireModule("rentals");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <AlquileresInner slug={selected.slug} />;
}
