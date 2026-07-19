"use client";

import { Plus, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Select } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, ApiError, type Client, type Property, type Rental } from "@/lib/api";

const eur = (n: number) => `${new Intl.NumberFormat("es-ES").format(n)} €`;

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
    </div>
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
