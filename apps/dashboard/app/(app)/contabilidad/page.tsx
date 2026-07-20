"use client";

import { Download, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
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

// Sentinel para "sin inmueble/cliente asignado" — distinto de "" (que en los
// filtros significa "todos"), así la fila "Sin asignar" de la vista agrupada
// puede filtrar específicamente los documentos sin ese vínculo.
const NONE = "__none__";

type GroupRow = {
  id: string;
  name: string;
  count: number;
  facturado: number;
  cobrado: number;
  pendiente: number;
  gastos: number;
  balance: number;
};

function groupInvoices(
  items: Invoice[],
  key: "propertyId" | "clientId",
  nameById: Record<string, string>,
): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const inv of items) {
    if (inv.status === "cancelled") continue;
    const id = inv[key] ?? NONE;
    const name = id === NONE ? "Sin asignar" : (nameById[id] ?? "—");
    let row = map.get(id);
    if (!row) {
      row = { id, name, count: 0, facturado: 0, cobrado: 0, pendiente: 0, gastos: 0, balance: 0 };
      map.set(id, row);
    }
    row.count += 1;
    if (inv.direction === "income") {
      row.facturado += inv.totalCents;
      row.cobrado += inv.paidCents;
      row.pendiente += inv.remainingCents;
    } else {
      row.gastos += inv.totalCents;
    }
  }
  for (const row of map.values()) row.balance = row.cobrado - row.gastos;
  return [...map.values()].sort((a, b) => b.facturado + b.gastos - (a.facturado + a.gastos));
}

function ContabilidadInner({ slug }: { slug: string }) {
  const { hasModule } = useWorkspace();
  const [items, setItems] = useState<Invoice[] | null>(null);
  const [propsList, setPropsList] = useState<Property[]>([]);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [tab, setTab] = useState<InvoiceDirection>("income");
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterPropertyId, setFilterPropertyId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [viewMode, setViewMode] = useState<"movimientos" | "byProperty" | "byClient">("movimientos");

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

  function afterEdit(updated: Invoice) {
    setItems((prev) => (prev ?? []).map((i) => (i.id === updated.id ? updated : i)));
    setEditingInvoice(null);
    setShowForm(false);
  }

  function startEdit(inv: Invoice) {
    setPayingId(null);
    setTab(inv.direction);
    setEditingInvoice(inv);
    setViewMode("movimientos");
    setShowForm(true);
  }

  const propNameById = Object.fromEntries(propsList.map((p) => [p.id, p.title]));
  const clientNameById = Object.fromEntries(clientsList.map((c) => [c.id, c.name]));

  function matchesFilter(i: Invoice) {
    const propOk =
      !filterPropertyId || (filterPropertyId === NONE ? i.propertyId == null : i.propertyId === filterPropertyId);
    const clientOk =
      !filterClientId || (filterClientId === NONE ? i.clientId == null : i.clientId === filterClientId);
    return propOk && clientOk;
  }

  const all = (items ?? []).filter(matchesFilter);
  const yearItems = all.filter((i) => i.issueDate.startsWith(String(currentYear)) && i.status !== "cancelled");
  const incomeCollected = yearItems.filter((i) => i.direction === "income").reduce((a, i) => a + i.paidCents, 0);
  const incomePending = yearItems
    .filter((i) => i.direction === "income")
    .reduce((a, i) => a + i.remainingCents, 0);
  const expensesTotal = yearItems.filter((i) => i.direction === "expense").reduce((a, i) => a + i.totalCents, 0);
  const balance = incomeCollected - expensesTotal;

  const list = all.filter((i) => i.direction === tab);

  const byProperty = groupInvoices(items ?? [], "propertyId", propNameById);
  const byClient = groupInvoices(items ?? [], "clientId", clientNameById);

  function openAccount(kind: "property" | "client", id: string) {
    if (kind === "property") {
      setFilterPropertyId(id);
      setFilterClientId("");
    } else {
      setFilterClientId(id);
      setFilterPropertyId("");
    }
    setViewMode("movimientos");
  }

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="du-h1">Contabilidad</h1>
        <Button
          onClick={() => {
            setPayingId(null);
            setEditingInvoice(null);
            setViewMode("movimientos");
            setShowForm((v) => (viewMode === "movimientos" && !editingInvoice ? !v : true));
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
        <TabButton active={viewMode === "movimientos"} onClick={() => setViewMode("movimientos")}>
          Movimientos
        </TabButton>
        {propsList.length > 0 ? (
          <TabButton active={viewMode === "byProperty"} onClick={() => setViewMode("byProperty")}>
            Por inmueble
          </TabButton>
        ) : null}
        {clientsList.length > 0 ? (
          <TabButton active={viewMode === "byClient"} onClick={() => setViewMode("byClient")}>
            Por cliente
          </TabButton>
        ) : null}
      </div>

      {viewMode === "byProperty" ? (
        <AccountsTable rows={byProperty} onSelect={(id) => openAccount("property", id)} />
      ) : viewMode === "byClient" ? (
        <AccountsTable rows={byClient} onSelect={(id) => openAccount("client", id)} />
      ) : (
        <>
      <div style={{ display: "flex", gap: "var(--ui-sp-3)", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
          <TabButton
            active={tab === "income"}
            onClick={() => {
              setTab("income");
              setShowForm(false);
              setEditingInvoice(null);
            }}
          >
            Facturas emitidas
          </TabButton>
          <TabButton
            active={tab === "expense"}
            onClick={() => {
              setTab("expense");
              setShowForm(false);
              setEditingInvoice(null);
            }}
          >
            Gastos
          </TabButton>
        </div>

        {propsList.length > 0 ? (
          <Select
            aria-label="Filtrar por inmueble"
            value={filterPropertyId}
            onChange={(e) => setFilterPropertyId(e.target.value)}
            style={{ maxWidth: 220 }}
          >
            <option value="">Todos los inmuebles</option>
            {propsList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        ) : null}

        {clientsList.length > 0 ? (
          <Select
            aria-label="Filtrar por cliente"
            value={filterClientId}
            onChange={(e) => setFilterClientId(e.target.value)}
            style={{ maxWidth: 220 }}
          >
            <option value="">Todos los clientes</option>
            {clientsList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        ) : null}

        {filterPropertyId || filterClientId ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterPropertyId("");
              setFilterClientId("");
            }}
          >
            Quitar filtros
          </Button>
        ) : null}
      </div>

      {showForm ? (
        tab === "income" ? (
          <IncomeForm
            slug={slug}
            propsList={propsList}
            clientsList={clientsList}
            initial={editingInvoice ?? undefined}
            onSaved={(inv) => {
              if (editingInvoice) {
                afterEdit(inv);
              } else {
                setItems((prev) => [inv, ...(prev ?? [])]);
                setShowForm(false);
              }
            }}
            onCancel={() => {
              setEditingInvoice(null);
              setShowForm(false);
            }}
          />
        ) : (
          <ExpenseForm
            slug={slug}
            propsList={propsList}
            clientsList={clientsList}
            initial={editingInvoice ?? undefined}
            onSaved={(inv) => {
              if (editingInvoice) {
                afterEdit(inv);
              } else {
                setItems((prev) => [inv, ...(prev ?? [])]);
                setShowForm(false);
              }
            }}
            onCancel={() => {
              setEditingInvoice(null);
              setShowForm(false);
            }}
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
                  <th>Inmueble</th>
                  <th>Cliente</th>
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
                      <td className="du-muted">
                        {inv.propertyId ? (propNameById[inv.propertyId] ?? "—") : "—"}
                      </td>
                      <td className="du-muted">
                        {inv.clientId ? (clientNameById[inv.clientId] ?? "—") : "—"}
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
                          onClick={() => startEdit(inv)}
                          aria-label="Editar"
                        >
                          <Pencil size={15} />
                        </Button>
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
                        <td colSpan={tab === "income" ? 10 : 9} style={{ background: "var(--ui-hover)" }}>
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
        </>
      )}
    </div>
  );
}

function AccountsTable({ rows, onSelect }: { rows: GroupRow[]; onSelect: (id: string) => void }) {
  return (
    <Card padded={false}>
      {rows.length === 0 ? (
        <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
          Sin movimientos todavía.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="du-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Facturado</th>
                <th>Cobrado</th>
                <th>Pendiente</th>
                <th>Gastos</th>
                <th>Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => onSelect(r.id)} style={{ cursor: "pointer" }}>
                  <td style={{ fontWeight: 500 }}>
                    {r.name}
                    <span className="du-muted" style={{ fontWeight: 400 }}>
                      {" "}
                      · {r.count} documento{r.count === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{eurCents(r.facturado)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{eurCents(r.cobrado)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{eurCents(r.pendiente)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{eurCents(r.gastos)}</td>
                  <td
                    style={{
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                      color: r.balance >= 0 ? "var(--ui-success)" : "var(--ui-danger)",
                    }}
                  >
                    {eurCents(r.balance)}
                  </td>
                  <td className="du-muted" style={{ textAlign: "right" }}>
                    Ver detalle →
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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
  initial,
  onSaved,
  onCancel,
}: {
  slug: string;
  propsList: Property[];
  clientsList: Client[];
  initial?: Invoice;
  onSaved: (i: Invoice) => void;
  onCancel: () => void;
}) {
  const isEdit = initial != null;
  const locked = isEdit && initial.paidCents > 0;
  const [propertyId, setPropertyId] = useState(initial?.propertyId ?? "");
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [vendorName, setVendorName] = useState(initial?.vendorName ?? "");
  const [category, setCategory] = useState<InvoiceCategory>(initial?.category ?? "other");
  const [concept, setConcept] = useState(initial?.concept ?? "");
  const [amount, setAmount] = useState(initial ? (initial.totalCents / 100).toFixed(2) : "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? todayISO());
  const [status, setStatus] = useState<"pending" | "paid" | "cancelled">(
    (initial?.status as "pending" | "paid" | "cancelled" | undefined) ?? "paid",
  );
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        const { invoice } = await api.invoices.update(slug, initial.id, {
          propertyId: propertyId || null,
          clientId: clientId || null,
          vendorName: vendorName || null,
          category,
          concept: concept || undefined,
          amount: locked ? undefined : Number(amount),
          issueDate,
          status,
          notes: notes || null,
        });
        onSaved(invoice);
      } else {
        const input: CreateExpenseInput = {
          propertyId: propertyId || undefined,
          clientId: clientId || undefined,
          vendorName: vendorName || undefined,
          category,
          concept: concept || undefined,
          amount,
          issueDate,
          status: status === "cancelled" ? "pending" : status,
          notes: notes || undefined,
          file,
        };
        const { invoice } = await api.invoices.createExpense(slug, input);
        onSaved(invoice);
      }
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
              disabled={locked}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {locked ? (
              <p className="du-muted" style={{ fontSize: 12, marginTop: 4 }}>
                Ya tiene un pago registrado — el importe no se puede editar.
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="ex-date">Fecha</Label>
            <Input id="ex-date" type="date" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ex-status">Estado</Label>
            <Select
              id="ex-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "pending" | "paid" | "cancelled")}
            >
              <option value="paid">Ya pagado</option>
              <option value="pending">Pendiente de pago</option>
              {isEdit ? <option value="cancelled">Anulado</option> : null}
            </Select>
          </div>
          <div>
            <Label htmlFor="ex-concept">Concepto</Label>
            <Input id="ex-concept" value={concept} onChange={(e) => setConcept(e.target.value)} />
          </div>
          {isEdit ? (
            initial.fileUrl ? (
              <div>
                <Label>Factura adjunta</Label>
                <a
                  href={initial.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="du-muted"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <Paperclip size={14} />
                  {initial.fileName ?? "Ver"}
                </a>
              </div>
            ) : null
          ) : (
            <div>
              <Label htmlFor="ex-file">Factura (PDF/imagen)</Label>
              <Input id="ex-file" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="ex-notes">Notas</Label>
          <Textarea id="ex-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error ? <p className="du-alert">{error}</p> : null}

        <div style={{ display: "flex", gap: "var(--ui-sp-3)" }}>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar gasto"}
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
  initial,
  onSaved,
  onCancel,
}: {
  slug: string;
  propsList: Property[];
  clientsList: Client[];
  initial?: Invoice;
  onSaved: (i: Invoice) => void;
  onCancel: () => void;
}) {
  const isEdit = initial != null;
  const locked = isEdit && initial.paidCents > 0;
  const [propertyId, setPropertyId] = useState(initial?.propertyId ?? "");
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [category, setCategory] = useState<InvoiceCategory>(initial?.category ?? "management_fee");
  const [concept, setConcept] = useState(initial?.concept ?? "");
  const [amount, setAmount] = useState(initial ? (initial.subtotalCents / 100).toFixed(2) : "");
  const [taxRatePercent, setTaxRatePercent] = useState(
    initial ? (initial.taxRateBps / 100).toFixed(2) : "21",
  );
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? todayISO());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [status, setStatus] = useState<"pending" | "cancelled">(
    initial?.status === "cancelled" ? "cancelled" : "pending",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        const { invoice } = await api.invoices.update(slug, initial.id, {
          propertyId: propertyId || null,
          clientId: clientId || null,
          category,
          concept,
          amount: locked ? undefined : Number(amount),
          taxRatePercent: locked ? undefined : taxRatePercent ? Number(taxRatePercent) : undefined,
          issueDate,
          dueDate: dueDate || null,
          status: initial.status === "paid" ? undefined : status,
          notes: notes || null,
        });
        onSaved(invoice);
      } else {
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
      }
    } catch {
      setError(
        isEdit ? "No se pudieron guardar los cambios." : "No se pudo emitir la factura. Revisa los datos.",
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
              disabled={locked}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {locked ? (
              <p className="du-muted" style={{ fontSize: 12, marginTop: 4 }}>
                Ya tiene un cobro registrado — el importe no se puede editar.
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="in-tax">IVA (%)</Label>
            <Input
              id="in-tax"
              type="number"
              step="0.01"
              min="0"
              disabled={locked}
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
          {isEdit && initial.status !== "paid" ? (
            <div>
              <Label htmlFor="in-status">Estado</Label>
              <Select id="in-status" value={status} onChange={(e) => setStatus(e.target.value as "pending" | "cancelled")}>
                <option value="pending">Pendiente</option>
                <option value="cancelled">Anulada</option>
              </Select>
            </div>
          ) : null}
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
            {submitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Emitir factura"}
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
