"use client";

import { Download, Paperclip, Plus, Trash2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import {
  api,
  ApiError,
  type Client,
  type CreateExpenseInput,
  type CreateIncomeInput,
  type Invoice,
  type InvoiceCategory,
  type InvoiceDirection,
  type InvoicePaymentMethod,
  type InvoiceStatus,
  type Property,
} from "@/lib/api";
import { INVOICE_CATEGORY_LABELS } from "@/lib/invoice-labels";

const eurCents = (c: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(c / 100)} €`;

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Borrador",
  pending: "Pendiente",
  paid: "Pagada",
  cancelled: "Anulada",
};
const STATUS_VARIANT: Record<InvoiceStatus, "muted" | "success" | "danger" | "default"> = {
  draft: "muted",
  pending: "default",
  paid: "success",
  cancelled: "muted",
};
const METHOD_LABEL: Record<InvoicePaymentMethod, string> = {
  transfer: "Transferencia",
  cash: "Efectivo",
  card: "Tarjeta",
  other: "Otro",
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const currentYear = new Date().getFullYear();

function ContabilidadInner({ slug }: { slug: string }) {
  const { hasModule } = useWorkspace();
  const [items, setItems] = useState<Invoice[] | null>(null);
  const [propsList, setPropsList] = useState<Property[]>([]);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [tab, setTab] = useState<InvoiceDirection>("income");
  const [showForm, setShowForm] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api.invoices.list(slug)).invoices);
    } catch {
      setError("No se pudieron cargar las facturas.");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (hasModule("properties")) void api.properties.list(slug).then((r) => setPropsList(r.properties)).catch(() => {});
    if (hasModule("clients")) void api.clients.list(slug).then((r) => setClientsList(r.clients)).catch(() => {});
  }, [slug, hasModule]);

  async function remove(id: string) {
    try {
      await api.invoices.remove(slug, id);
      setItems((prev) => (prev ?? []).filter((i) => i.id !== id));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "No se puede borrar: ya tiene un pago registrado."
          : "No se pudo borrar.",
      );
    }
  }

  async function downloadPdf(id: string) {
    try {
      const blob = await api.invoices.pdf(slug, id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setError("No se pudo generar el PDF.");
    }
  }

  function afterPayment(updated: Invoice) {
    setItems((prev) => (prev ?? []).map((i) => (i.id === updated.id ? updated : i)));
    setPayingId(null);
  }

  const all = items ?? [];
  const yearItems = all.filter((i) => i.issueDate.startsWith(String(currentYear)) && i.status !== "cancelled");
  const incomeCollected = yearItems.filter((i) => i.direction === "income").reduce((a, i) => a + i.paidCents, 0);
  const incomePending = yearItems
    .filter((i) => i.direction === "income")
    .reduce((a, i) => a + i.remainingCents, 0);
  const expensesTotal = yearItems.filter((i) => i.direction === "expense").reduce((a, i) => a + i.totalCents, 0);
  const balance = incomeCollected - expensesTotal;

  const list = all.filter((i) => i.direction === tab);

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="du-h1">Contabilidad</h1>
        <Button
          onClick={() => {
            setPayingId(null);
            setShowForm((v) => !v);
          }}
        >
          <Plus size={16} />
          {tab === "income" ? "Nueva factura" : "Nuevo gasto"}
        </Button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--ui-sp-4)",
        }}
      >
        <SummaryCard label={`Cobrado ${currentYear}`} value={eurCents(incomeCollected)} />
        <SummaryCard label="Pendiente de cobro" value={eurCents(incomePending)} />
        <SummaryCard label={`Gastos ${currentYear}`} value={eurCents(expensesTotal)} />
        <SummaryCard label="Balance" value={eurCents(balance)} accent={balance >= 0 ? "success" : "danger"} />
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      <div style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
        <TabButton active={tab === "income"} onClick={() => { setTab("income"); setShowForm(false); }}>
          Facturas emitidas
        </TabButton>
        <TabButton active={tab === "expense"} onClick={() => { setTab("expense"); setShowForm(false); }}>
          Gastos
        </TabButton>
      </div>

      {showForm ? (
        tab === "income" ? (
          <IncomeForm
            slug={slug}
            propsList={propsList}
            clientsList={clientsList}
            onSaved={(inv) => {
              setItems((prev) => [inv, ...(prev ?? [])]);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <ExpenseForm
            slug={slug}
            propsList={propsList}
            clientsList={clientsList}
            onSaved={(inv) => {
              setItems((prev) => [inv, ...(prev ?? [])]);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        )
      ) : null}

      <Card padded={false}>
        {items === null ? (
          <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
            Cargando…
          </p>
        ) : list.length === 0 ? (
          <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
            {tab === "income" ? "Aún no has emitido ninguna factura." : "Aún no has registrado gastos."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="du-table">
              <thead>
                <tr>
                  {tab === "income" ? <th>Número</th> : null}
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Categoría</th>
                  <th>Importe</th>
                  <th>Estado</th>
                  <th>Adjunto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((inv) => (
                  <Fragment key={inv.id}>
                    <tr>
                      {tab === "income" ? <td style={{ whiteSpace: "nowrap" }}>{inv.number ?? "—"}</td> : null}
                      <td style={{ whiteSpace: "nowrap" }}>
                        {new Date(inv.issueDate).toLocaleDateString("es-ES")}
                      </td>
                      <td>{inv.concept ?? "—"}</td>
                      <td>
                        <Badge variant="default">{INVOICE_CATEGORY_LABELS[inv.category]}</Badge>
                      </td>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>
                        {eurCents(inv.totalCents)}
                        {inv.status !== "paid" && inv.status !== "cancelled" && inv.paidCents > 0 ? (
                          <span className="du-muted" style={{ fontWeight: 400 }}>
                            {" "}
                            · quedan {eurCents(inv.remainingCents)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <Badge variant={STATUS_VARIANT[inv.status]}>{STATUS_LABEL[inv.status]}</Badge>
                        {inv.overdue ? (
                          <Badge variant="danger" style={{ marginLeft: 4 }}>
                            Vencida
                          </Badge>
                        ) : null}
                      </td>
                      <td>
                        {inv.fileUrl ? (
                          <a
                            href={inv.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="du-muted"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            <Paperclip size={14} />
                            {inv.fileName ?? "Ver"}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {inv.direction === "income" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void downloadPdf(inv.id)}
                            aria-label="Descargar PDF"
                          >
                            <Download size={15} />
                          </Button>
                        ) : null}
                        {inv.status === "pending" || inv.status === "draft" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowForm(false);
                              setPayingId(payingId === inv.id ? null : inv.id);
                            }}
                          >
                            Cobro
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void remove(inv.id)}
                          aria-label="Eliminar"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </td>
                    </tr>
                    {payingId === inv.id ? (
                      <tr>
                        <td colSpan={tab === "income" ? 8 : 7} style={{ background: "var(--ui-hover)" }}>
                          <PaymentForm slug={slug} invoice={inv} onSaved={afterPayment} onCancel={() => setPayingId(null)} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "danger";
}) {
  return (
    <Card>
      <p className="du-muted" style={{ fontSize: 12, marginBottom: 4 }}>
        {label}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          color:
            accent === "success"
              ? "var(--ui-success)"
              : accent === "danger"
                ? "var(--ui-danger)"
                : "var(--ui-text)",
        }}
      >
        {value}
      </p>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "var(--ui-sp-2) var(--ui-sp-4)",
        borderRadius: "var(--ui-radius)",
        border: "1px solid var(--ui-border)",
        background: active ? "var(--ui-primary)" : "transparent",
        color: active ? "var(--ui-on-primary)" : "var(--ui-text)",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}

function EntityPicker({
  propsList,
  clientsList,
  propertyId,
  setPropertyId,
  clientId,
  setClientId,
}: {
  propsList: Property[];
  clientsList: Client[];
  propertyId: string;
  setPropertyId: (v: string) => void;
  clientId: string;
  setClientId: (v: string) => void;
}) {
  return (
    <>
      {propsList.length > 0 ? (
        <div>
          <Label htmlFor="inv-prop">Inmueble (opcional)</Label>
          <Select id="inv-prop" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">— Ninguno —</option>
            {propsList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {clientsList.length > 0 ? (
        <div>
          <Label htmlFor="inv-client">Cliente (opcional)</Label>
          <Select id="inv-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— Ninguno —</option>
            {clientsList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
    </>
  );
}

function ExpenseForm({
  slug,
  propsList,
  clientsList,
  onSaved,
  onCancel,
}: {
  slug: string;
  propsList: Property[];
  clientsList: Client[];
  onSaved: (i: Invoice) => void;
  onCancel: () => void;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [clientId, setClientId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [category, setCategory] = useState<InvoiceCategory>("other");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [status, setStatus] = useState<"pending" | "paid">("paid");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input: CreateExpenseInput = {
        propertyId: propertyId || undefined,
        clientId: clientId || undefined,
        vendorName: vendorName || undefined,
        category,
        concept: concept || undefined,
        amount,
        issueDate,
        status,
        notes: notes || undefined,
        file,
      };
      const { invoice } = await api.invoices.createExpense(slug, input);
      onSaved(invoice);
    } catch (err) {
      setError(
        err instanceof ApiError && err.message === "invalid_file_type"
          ? "Archivo no admitido: sube un PDF o una imagen."
          : "No se pudo guardar el gasto. Revisa los datos.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const fieldGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "var(--ui-sp-4)",
  } as const;

  return (
    <Card>
      <form onSubmit={submit} style={{ display: "grid", gap: "var(--ui-sp-4)" }}>
        <div style={fieldGrid}>
          <EntityPicker
            propsList={propsList}
            clientsList={clientsList}
            propertyId={propertyId}
            setPropertyId={setPropertyId}
            clientId={clientId}
            setClientId={setClientId}
          />
          <div>
            <Label htmlFor="ex-vendor">Proveedor</Label>
            <Input id="ex-vendor" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ex-cat">Categoría</Label>
            <Select id="ex-cat" value={category} onChange={(e) => setCategory(e.target.value as InvoiceCategory)}>
              {Object.entries(INVOICE_CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ex-amount">Importe (€)</Label>
            <Input
              id="ex-amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ex-date">Fecha</Label>
            <Input id="ex-date" type="date" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ex-status">Estado</Label>
            <Select id="ex-status" value={status} onChange={(e) => setStatus(e.target.value as "pending" | "paid")}>
              <option value="paid">Ya pagado</option>
              <option value="pending">Pendiente de pago</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="ex-concept">Concepto</Label>
            <Input id="ex-concept" value={concept} onChange={(e) => setConcept(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ex-file">Factura (PDF/imagen)</Label>
            <Input id="ex-file" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <div>
          <Label htmlFor="ex-notes">Notas</Label>
          <Textarea id="ex-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error ? <p className="du-alert">{error}</p> : null}

        <div style={{ display: "flex", gap: "var(--ui-sp-3)" }}>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Guardando…" : "Guardar gasto"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function IncomeForm({
  slug,
  propsList,
  clientsList,
  onSaved,
  onCancel,
}: {
  slug: string;
  propsList: Property[];
  clientsList: Client[];
  onSaved: (i: Invoice) => void;
  onCancel: () => void;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [clientId, setClientId] = useState("");
  const [category, setCategory] = useState<InvoiceCategory>("management_fee");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [taxRatePercent, setTaxRatePercent] = useState("21");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input: CreateIncomeInput = {
        propertyId: propertyId || undefined,
        clientId: clientId || undefined,
        category,
        concept,
        amount: Number(amount),
        taxRatePercent: taxRatePercent ? Number(taxRatePercent) : undefined,
        issueDate,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
      };
      const { invoice } = await api.invoices.createIncome(slug, input);
      onSaved(invoice);
    } catch {
      setError("No se pudo emitir la factura. Revisa los datos.");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "var(--ui-sp-4)",
  } as const;

  return (
    <Card>
      <form onSubmit={submit} style={{ display: "grid", gap: "var(--ui-sp-4)" }}>
        <div style={fieldGrid}>
          <EntityPicker
            propsList={propsList}
            clientsList={clientsList}
            propertyId={propertyId}
            setPropertyId={setPropertyId}
            clientId={clientId}
            setClientId={setClientId}
          />
          <div>
            <Label htmlFor="in-cat">Categoría</Label>
            <Select id="in-cat" value={category} onChange={(e) => setCategory(e.target.value as InvoiceCategory)}>
              {Object.entries(INVOICE_CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="in-amount">Base imponible (€)</Label>
            <Input
              id="in-amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="in-tax">IVA (%)</Label>
            <Input
              id="in-tax"
              type="number"
              step="0.01"
              min="0"
              value={taxRatePercent}
              onChange={(e) => setTaxRatePercent(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="in-date">Fecha de emisión</Label>
            <Input id="in-date" type="date" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="in-due">Vencimiento</Label>
            <Input id="in-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="in-concept">Concepto</Label>
          <Input id="in-concept" required value={concept} onChange={(e) => setConcept(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="in-notes">Notas</Label>
          <Textarea id="in-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error ? <p className="du-alert">{error}</p> : null}

        <div style={{ display: "flex", gap: "var(--ui-sp-3)" }}>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Emitiendo…" : "Emitir factura"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PaymentForm({
  slug,
  invoice,
  onSaved,
  onCancel,
}: {
  slug: string;
  invoice: Invoice;
  onSaved: (i: Invoice) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState((invoice.remainingCents / 100).toFixed(2));
  const [method, setMethod] = useState<InvoicePaymentMethod>("transfer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { invoice: updated } = await api.invoices.addPayment(slug, invoice.id, {
        amount: Number(amount),
        method,
      });
      onSaved(updated);
    } catch {
      setError("No se pudo registrar el cobro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: "flex",
        gap: "var(--ui-sp-3)",
        alignItems: "end",
        flexWrap: "wrap",
        padding: "var(--ui-sp-3) 0",
      }}
    >
      <div>
        <Label htmlFor="pay-amount">Importe (€)</Label>
        <Input
          id="pay-amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: 120 }}
        />
      </div>
      <div>
        <Label htmlFor="pay-method">Método</Label>
        <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as InvoicePaymentMethod)}>
          {Object.entries(METHOD_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </div>
      {error ? <p className="du-alert">{error}</p> : null}
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? "Guardando…" : "Registrar"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancelar
      </Button>
    </form>
  );
}

export default function ContabilidadPage() {
  const { selected } = useWorkspace();
  const loading = useRequireModule("accounting");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <ContabilidadInner slug={selected.slug} />;
}
