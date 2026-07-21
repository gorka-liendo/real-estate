"use client";

import { Check, Home, ImageIcon, KeyRound, MapPin, Paperclip, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, ButtonLink, Card, Input, Label, Select } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import {
  api,
  ApiError,
  type Client,
  type Invoice,
  type InvoiceCategory,
  type Property,
  type Rental,
} from "@/lib/api";
import { INVOICE_CATEGORY_LABELS } from "@/lib/invoice-labels";

const eur = (n: number) => `${new Intl.NumberFormat("es-ES").format(n)} €`;
const eurCents = (c: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(c / 100)} €`;

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// "YYYY-MM" del mes N atrás (0 = mes actual).
function periodAgo(n: number): string {
  const d = new Date();
  const x = new Date(d.getFullYear(), d.getMonth() - n, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}
const periodShort = (p: string) => `${MONTH_SHORT[Number(p.slice(5)) - 1]}`;
const paymentFor = (r: Rental, period: string) => r.payments.find((p) => p.period.startsWith(period));

function AlquileresInner({ slug }: { slug: string }) {
  const { hasModule } = useWorkspace();
  const [items, setItems] = useState<Rental[] | null>(null);
  const [propsList, setPropsList] = useState<Property[]>([]);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [prefillProp, setPrefillProp] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api.rentals.list(slug)).rentals);
      if (hasModule("properties")) {
        setPropsList((await api.properties.list(slug)).properties);
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

  const propsById = useMemo(
    () => Object.fromEntries(propsList.map((p) => [p.id, p])),
    [propsList],
  );

  async function togglePayment(r: Rental, period: string) {
    setError(null);
    const next = paymentFor(r, period)?.status === "paid" ? "pending" : "paid";
    try {
      await api.rentals.setPayment(slug, r.id, period, next);
      await load();
    } catch {
      setError("No se pudo registrar el cobro.");
    }
  }

  function openNewContract(propertyId = "") {
    setPrefillProp(propertyId);
    setShowForm(true);
  }

  const currentPeriod = periodAgo(0);
  const activeRentals = (items ?? []).filter((r) => r.status === "active");

  // Inmuebles en alquiler sin contrato activo → disponibles para crear uno.
  const rentedPropIds = new Set(activeRentals.map((r) => r.propertyId));
  const availableProps = propsList.filter(
    (p) => p.operation === "rent" && !rentedPropIds.has(p.id),
  );

  // Resumen del mes en curso.
  const collectedThisMonth = activeRentals.reduce((sum, r) => {
    const pay = paymentFor(r, currentPeriod);
    return pay?.status === "paid" ? sum + (pay.amount ?? r.monthlyRent) : sum;
  }, 0);
  const pendingThisMonth = activeRentals.filter(
    (r) => paymentFor(r, currentPeriod)?.status !== "paid",
  ).length;

  // Contratos ordenados: activos primero, luego finalizados.
  const sorted = [...(items ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--ui-sp-3)" }}>
        <h1 className="du-h1" style={{ margin: 0 }}>
          Alquileres
        </h1>
        <Button onClick={() => openNewContract()}>
          <Plus size={16} />
          Nuevo contrato
        </Button>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      {/* Resumen del mes */}
      {items && items.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--ui-sp-4)",
          }}
        >
          <StatCard label="Contratos activos" value={String(activeRentals.length)} />
          <StatCard label={`Cobrado ${periodShort(currentPeriod)}.`} value={eur(collectedThisMonth)} />
          <StatCard
            label={`Pendiente ${periodShort(currentPeriod)}.`}
            value={String(pendingThisMonth)}
            tone={pendingThisMonth > 0 ? "warning" : "default"}
          />
        </div>
      ) : null}

      {showForm ? (
        <NewRentalForm
          slug={slug}
          propsList={propsList}
          clientsList={clientsList}
          initialPropertyId={prefillProp}
          onCreated={() => {
            setShowForm(false);
            void load();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {/* Tarjetas de contratos */}
      {items === null ? (
        <p className="du-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: "var(--ui-sp-6) 0" }}>
            <KeyRound size={28} color="var(--ui-muted)" />
            <p style={{ margin: "var(--ui-sp-3) 0 var(--ui-sp-4)" }}>
              Aún no gestionas ningún alquiler.
            </p>
            <Button onClick={() => openNewContract()}>
              <Plus size={16} />
              Crear el primer contrato
            </Button>
          </div>
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "var(--ui-sp-4)",
          }}
        >
          {sorted.map((r) => (
            <RentalCard
              key={r.id}
              rental={r}
              property={propsById[r.propertyId]}
              currentPeriod={currentPeriod}
              onTogglePayment={(period) => void togglePayment(r, period)}
            />
          ))}
        </div>
      )}

      {/* Inmuebles en alquiler sin contrato */}
      {availableProps.length > 0 ? (
        <div style={{ display: "grid", gap: "var(--ui-sp-3)" }}>
          <h2 className="du-h3" style={{ margin: 0 }}>
            Disponibles para alquilar
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: "var(--ui-sp-4)",
            }}
          >
            {availableProps.map((p) => (
              <AvailableCard key={p.id} property={p} onCreate={() => openNewContract(p.id)} />
            ))}
          </div>
        </div>
      ) : null}

      {hasModule("accounting") ? <ExpensesCard slug={slug} propsList={propsList} /> : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      style={{
        background: "var(--ui-surface)",
        border: "1px solid var(--ui-border)",
        borderRadius: "var(--ui-radius-lg)",
        padding: "var(--ui-sp-4)",
      }}
    >
      <div className="du-muted" style={{ fontSize: 13 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 600,
          marginTop: 2,
          color: tone === "warning" ? "var(--ui-warning)" : "var(--ui-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// Cobertura de una foto para las tarjetas (altura fija, recorte con overflow).
function CardPhoto({ url, children }: { url?: string; children?: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        height: 160,
        overflow: "hidden",
        background: "var(--ui-hover)",
        display: "grid",
        placeItems: "center",
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <ImageIcon size={22} color="var(--ui-muted)" />
      )}
      {children}
    </div>
  );
}

// Chip con fondo sólido para que los badges se lean sobre cualquier foto.
function OverlayChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        position: "absolute",
        top: "var(--ui-sp-3)",
        left: "var(--ui-sp-3)",
        background: "var(--ui-surface)",
        borderRadius: 999,
        padding: "2px 4px",
        boxShadow: "var(--ui-shadow-sm)",
      }}
    >
      {children}
    </span>
  );
}

function RentalCard({
  rental,
  property,
  currentPeriod,
  onTogglePayment,
}: {
  rental: Rental;
  property?: Property;
  currentPeriod: string;
  onTogglePayment: (period: string) => void;
}) {
  const isActive = rental.status === "active";
  const title = property?.title ?? "Inmueble";
  const pay = paymentFor(rental, currentPeriod);
  const paid = pay?.status === "paid";

  return (
    <div
      style={{
        background: "var(--ui-surface)",
        border: "1px solid var(--ui-border)",
        borderRadius: "var(--ui-radius-lg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "var(--ui-shadow-sm)",
      }}
    >
      <CardPhoto url={property?.photos[0]}>
        <OverlayChip>
          <Badge variant={isActive ? "success" : "default"}>
            {isActive ? "Activo" : "Finalizado"}
          </Badge>
        </OverlayChip>
      </CardPhoto>

      <div style={{ padding: "var(--ui-sp-4)", display: "grid", gap: "var(--ui-sp-3)", flex: 1 }}>
        <div>
          <Link
            href={`/alquileres/${rental.id}`}
            style={{ color: "inherit", textDecoration: "none", fontWeight: 600, fontSize: 16 }}
          >
            {title}
          </Link>
          <div className="du-muted" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
            {property?.city ? (
              <>
                <MapPin size={12} />
                {property.city}
                {" · "}
              </>
            ) : null}
            {rental.renterName}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 600 }}>{eur(rental.monthlyRent)}</span>
          <span className="du-muted" style={{ fontSize: 13 }}>
            /mes
          </span>
        </div>

        {/* Cobro del mes en curso */}
        {isActive ? (
          <button
            type="button"
            onClick={() => onTogglePayment(currentPeriod)}
            aria-label={`Marcar ${periodShort(currentPeriod)} como ${paid ? "pendiente" : "cobrado"}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--ui-sp-2)",
              padding: "var(--ui-sp-2) var(--ui-sp-3)",
              borderRadius: "var(--ui-radius)",
              border: `1px solid ${paid ? "transparent" : "var(--ui-border)"}`,
              background: paid ? "var(--ui-success-bg)" : "transparent",
              color: paid ? "var(--ui-success)" : "var(--ui-text)",
              cursor: "pointer",
              font: "inherit",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {paid ? <Check size={15} /> : <span style={{ opacity: 0.5 }}>○</span>}
              {periodShort(currentPeriod).charAt(0).toUpperCase() + periodShort(currentPeriod).slice(1)}{" "}
              {new Date().getFullYear()}
            </span>
            <span>{paid ? "Cobrado" : "Marcar cobrado"}</span>
          </button>
        ) : (
          <div className="du-muted" style={{ fontSize: 13 }}>
            Contrato finalizado
          </div>
        )}

        {/* Mini-historial: últimos 4 meses */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {[3, 2, 1, 0].map((n) => {
            const period = periodAgo(n);
            const p = paymentFor(rental, period);
            const isPaid = p?.status === "paid";
            return (
              <span
                key={period}
                title={`${periodShort(period)}: ${isPaid ? "cobrado" : "sin cobrar"}`}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 3,
                  background: isPaid ? "var(--ui-success)" : "var(--ui-border-strong)",
                  opacity: isPaid ? 1 : 0.4,
                }}
              />
            );
          })}
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--ui-border)", padding: "var(--ui-sp-2) var(--ui-sp-3)" }}>
        <ButtonLink href={`/alquileres/${rental.id}`} variant="ghost" size="sm">
          Gestionar contrato →
        </ButtonLink>
      </div>
    </div>
  );
}

function AvailableCard({ property, onCreate }: { property: Property; onCreate: () => void }) {
  return (
    <div
      style={{
        background: "var(--ui-surface)",
        border: "1px dashed var(--ui-border-strong)",
        borderRadius: "var(--ui-radius-lg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CardPhoto url={property.photos[0]} />
      <div style={{ padding: "var(--ui-sp-4)", display: "grid", gap: "var(--ui-sp-3)", flex: 1 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
            <Home size={14} color="var(--ui-muted)" />
            {property.title}
          </div>
          <div className="du-muted" style={{ fontSize: 13, marginTop: 2 }}>
            {property.city ? `${property.city} · ` : ""}Sin contrato activo
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus size={15} />
          Crear contrato
        </Button>
      </div>
    </div>
  );
}

// Gastos y facturas por inmueble: la agencia sube la factura categorizada
// (agua, luz, comunidad, derramas…) y el propietario la ve en su portal.
function ExpensesCard({ slug, propsList }: { slug: string; propsList: Property[] }) {
  const [propertyId, setPropertyId] = useState("");
  const [items, setItems] = useState<Invoice[] | null>(null);
  const [category, setCategory] = useState<InvoiceCategory>("water");
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
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
      setItems((await api.invoices.list(slug, { direction: "expense", propertyId: pid })).invoices);
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
      await api.invoices.createExpense(slug, {
        propertyId,
        category,
        amount,
        issueDate,
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
    try {
      await api.invoices.remove(slug, id);
      await load(propertyId);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "No se puede borrar: ya tiene un pago registrado. Gestiónalo desde Contabilidad."
          : "No se pudo borrar el gasto.",
      );
    }
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
              <Select id="e-cat" value={category} onChange={(e) => setCategory(e.target.value as InvoiceCategory)}>
                {Object.entries(INVOICE_CATEGORY_LABELS).map(([v, l]) => (
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
              <Input id="e-date" type="date" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
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
                        {new Date(e.issueDate).toLocaleDateString("es-ES")}
                      </td>
                      <td>
                        <Badge variant="default">{INVOICE_CATEGORY_LABELS[e.category]}</Badge>
                      </td>
                      <td>{e.concept ?? "—"}</td>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>{eurCents(e.totalCents)}</td>
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
  initialPropertyId = "",
  onCreated,
  onCancel,
}: {
  slug: string;
  propsList: Property[];
  clientsList: Client[];
  initialPropertyId?: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [propertyId, setPropertyId] = useState(initialPropertyId);
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
