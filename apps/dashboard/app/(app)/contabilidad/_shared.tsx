"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@rep/ui";
import { Breadcrumbs } from "@/components/breadcrumbs";
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
  type PropertyRoom,
} from "@/lib/api";
import { INVOICE_CATEGORY_LABELS } from "@/lib/invoice-labels";

// Piezas de Contabilidad compartidas entre la página principal (Movimientos +
// vista agrupada) y las páginas de cuenta (/contabilidad/inmueble|cliente/[id]).
// Una sola tabla, un solo par de formularios — evita que las tres vistas
// diverjan con el tiempo.

export const eurCents = (c: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(c / 100)} €`;

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Borrador",
  pending: "Pendiente",
  paid: "Pagada",
  cancelled: "Anulada",
};
export const STATUS_VARIANT: Record<InvoiceStatus, "muted" | "success" | "danger" | "default"> = {
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

export function SummaryCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent?: "success" | "danger";
  icon?: ReactNode;
}) {
  const color =
    accent === "success"
      ? "var(--ui-success)"
      : accent === "danger"
        ? "var(--ui-danger)"
        : "var(--ui-text)";
  return (
    <div
      style={{
        background: "var(--ui-surface)",
        border: "1px solid var(--ui-border)",
        borderRadius: "var(--ui-radius-lg)",
        padding: "var(--ui-sp-4)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "var(--ui-sp-3)",
      }}
    >
      <div>
        <p className="du-muted" style={{ fontSize: 13, marginBottom: 2 }}>
          {label}
        </p>
        <p style={{ fontSize: 26, fontWeight: 600, color, margin: 0 }}>{value}</p>
      </div>
      {icon ? <span style={{ color: accent ? color : "var(--ui-muted)", opacity: 0.9 }}>{icon}</span> : null}
    </div>
  );
}

export function TabButton({
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

export function EntityPicker({
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

// Selector de habitación para imputar la factura/gasto a una habitación concreta.
// Solo aparece si el inmueble seleccionado tiene habitaciones.
export function RoomPicker({
  slug,
  propertyId,
  roomId,
  setRoomId,
}: {
  slug: string;
  propertyId: string;
  roomId: string;
  setRoomId: (v: string) => void;
}) {
  const [rooms, setRooms] = useState<PropertyRoom[]>([]);
  useEffect(() => {
    if (!propertyId) {
      setRooms([]);
      return;
    }
    let alive = true;
    void api.rooms
      .list(slug, propertyId)
      .then((r) => {
        if (alive) setRooms(r.rooms);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug, propertyId]);
  // Si la habitación elegida ya no pertenece al inmueble, límpiala.
  useEffect(() => {
    if (roomId && rooms.length > 0 && !rooms.some((r) => r.id === roomId)) setRoomId("");
  }, [rooms, roomId, setRoomId]);

  if (rooms.length === 0) return null;
  return (
    <div>
      <Label htmlFor="inv-room">Habitación (opcional)</Label>
      <Select id="inv-room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
        <option value="">— Todo el inmueble —</option>
        {rooms.map((rm) => (
          <option key={rm.id} value={rm.id}>
            {rm.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function ExpenseForm({
  slug,
  propsList,
  clientsList,
  initial,
  presetPropertyId,
  presetClientId,
  onSaved,
  onCancel,
}: {
  slug: string;
  propsList: Property[];
  clientsList: Client[];
  initial?: Invoice;
  presetPropertyId?: string;
  presetClientId?: string;
  onSaved: (i: Invoice) => void;
  onCancel: () => void;
}) {
  const isEdit = initial != null;
  const locked = isEdit && initial.paidCents > 0;
  const [propertyId, setPropertyId] = useState(initial?.propertyId ?? presetPropertyId ?? "");
  const [roomId, setRoomId] = useState(initial?.roomId ?? "");
  const [clientId, setClientId] = useState(initial?.clientId ?? presetClientId ?? "");
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
          roomId: propertyId ? roomId || null : null,
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
          roomId: propertyId ? roomId || undefined : undefined,
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
          <RoomPicker slug={slug} propertyId={propertyId} roomId={roomId} setRoomId={setRoomId} />
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

export function IncomeForm({
  slug,
  propsList,
  clientsList,
  initial,
  presetPropertyId,
  presetClientId,
  onSaved,
  onCancel,
}: {
  slug: string;
  propsList: Property[];
  clientsList: Client[];
  initial?: Invoice;
  presetPropertyId?: string;
  presetClientId?: string;
  onSaved: (i: Invoice) => void;
  onCancel: () => void;
}) {
  const isEdit = initial != null;
  const locked = isEdit && initial.paidCents > 0;
  const [propertyId, setPropertyId] = useState(initial?.propertyId ?? presetPropertyId ?? "");
  const [roomId, setRoomId] = useState(initial?.roomId ?? "");
  const [clientId, setClientId] = useState(initial?.clientId ?? presetClientId ?? "");
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
          roomId: propertyId ? roomId || null : null,
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
          roomId: propertyId ? roomId || undefined : undefined,
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
          <RoomPicker slug={slug} propertyId={propertyId} roomId={roomId} setRoomId={setRoomId} />
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

export function PaymentForm({
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

// Tabla de movimientos — usada tanto en Contabilidad > Movimientos como en
// las páginas de cuenta (donde se ocultan las columnas Inmueble/Cliente, ya
// que son redundantes con el contexto de la página).
export function InvoiceTable({
  slug,
  items,
  direction,
  propNameById = {},
  clientNameById = {},
  roomNameById = {},
  showPropertyColumn = true,
  showClientColumn = true,
  onEdit,
  onChange,
  emptyMessage,
}: {
  slug: string;
  items: Invoice[];
  direction: InvoiceDirection;
  propNameById?: Record<string, string>;
  clientNameById?: Record<string, string>;
  roomNameById?: Record<string, string>;
  showPropertyColumn?: boolean;
  showClientColumn?: boolean;
  onEdit: (inv: Invoice) => void;
  onChange: (updater: (prev: Invoice[]) => Invoice[]) => void;
  emptyMessage: string;
}) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = items.filter((i) => i.direction === direction);

  async function remove(id: string) {
    try {
      await api.invoices.remove(slug, id);
      onChange((prev) => prev.filter((i) => i.id !== id));
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
    onChange((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setPayingId(null);
  }

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-3)" }}>
      {error ? <p className="du-alert">{error}</p> : null}
      <Card padded={false}>
        {list.length === 0 ? (
          <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
            {emptyMessage}
          </p>
        ) : (
          <div>
            {list.map((inv, idx) => {
              const isIncome = inv.direction === "income";
              const partial =
                inv.status !== "paid" && inv.status !== "cancelled" && inv.paidCents > 0;
              const meta = [
                new Date(inv.issueDate).toLocaleDateString("es-ES"),
                isIncome && inv.number ? inv.number : null,
                INVOICE_CATEGORY_LABELS[inv.category],
                showPropertyColumn && inv.propertyId ? propNameById[inv.propertyId] : null,
                inv.roomId ? (roomNameById[inv.roomId] ?? "Habitación") : null,
                showClientColumn && inv.clientId ? clientNameById[inv.clientId] : null,
              ].filter(Boolean);

              return (
                <Fragment key={inv.id}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--ui-sp-3)",
                      flexWrap: "wrap",
                      padding: "var(--ui-sp-3) var(--ui-sp-4)",
                      borderTop: idx > 0 ? "1px solid var(--ui-border)" : "none",
                    }}
                  >
                    {/* Indicador de dirección */}
                    <span
                      style={{
                        flexShrink: 0,
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        background: isIncome ? "var(--ui-success-bg)" : "var(--ui-danger-bg)",
                        color: isIncome ? "var(--ui-success)" : "var(--ui-danger)",
                      }}
                    >
                      {isIncome ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                    </span>

                    {/* Concepto + metadatos */}
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontWeight: 500 }}>
                        {inv.concept || INVOICE_CATEGORY_LABELS[inv.category]}
                      </div>
                      <div
                        className="du-muted"
                        style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
                      >
                        <span>{meta.join(" · ")}</span>
                        {inv.fileUrl ? (
                          <a
                            href={inv.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="du-muted"
                            style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
                            aria-label="Ver adjunto"
                          >
                            <Paperclip size={13} />
                          </a>
                        ) : null}
                      </div>
                    </div>

                    {/* Importe + estado */}
                    <div style={{ textAlign: "right", minWidth: 110 }}>
                      <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                        {isIncome ? "" : "−"}
                        {eurCents(inv.totalCents)}
                      </div>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 2 }}>
                        <Badge variant={STATUS_VARIANT[inv.status]}>{STATUS_LABEL[inv.status]}</Badge>
                        {inv.overdue ? <Badge variant="danger">Vencida</Badge> : null}
                      </div>
                      {partial ? (
                        <div className="du-muted" style={{ fontSize: 12, marginTop: 2 }}>
                          quedan {eurCents(inv.remainingCents)}
                        </div>
                      ) : null}
                    </div>

                    {/* Acciones */}
                    <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                      {isIncome ? (
                        <Button variant="ghost" size="sm" onClick={() => void downloadPdf(inv.id)} aria-label="Descargar PDF">
                          <Download size={15} />
                        </Button>
                      ) : null}
                      {inv.status === "pending" || inv.status === "draft" ? (
                        <Button variant="ghost" size="sm" onClick={() => setPayingId(payingId === inv.id ? null : inv.id)}>
                          Cobro
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => onEdit(inv)} aria-label="Editar">
                        <Pencil size={15} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void remove(inv.id)} aria-label="Eliminar">
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>

                  {payingId === inv.id ? (
                    <div style={{ background: "var(--ui-hover)", padding: "var(--ui-sp-4)", borderTop: "1px solid var(--ui-border)" }}>
                      <PaymentForm slug={slug} invoice={inv} onSaved={afterPayment} onCancel={() => setPayingId(null)} />
                    </div>
                  ) : null}
                </Fragment>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// Página de cuenta (/contabilidad/inmueble|cliente/[id]): mismos datos que la
// vista agrupada de Contabilidad pero en su propio "menú" — resumen + tabs de
// facturas/gastos ya filtrados por esta cuenta, sin tener que repetir el
// filtro cada vez. `kind` decide qué columna de InvoiceTable es redundante
// (la propia cuenta) y qué campo se preselecciona al dar de alta.
export function AccountDetail({
  slug,
  kind,
  id,
  name,
  items,
  setItems,
  propsList,
  clientsList,
}: {
  slug: string;
  kind: "property" | "client";
  id: string;
  name: string;
  items: Invoice[];
  setItems: (updater: (prev: Invoice[]) => Invoice[]) => void;
  propsList: Property[];
  clientsList: Client[];
}) {
  const [tab, setTab] = useState<"resumen" | InvoiceDirection>("resumen");
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [rooms, setRooms] = useState<PropertyRoom[]>([]);

  // Habitaciones del inmueble (solo en cuentas de inmueble) para el desglose.
  useEffect(() => {
    if (kind !== "property") return;
    let alive = true;
    void api.rooms
      .list(slug, id)
      .then((r) => {
        if (alive) setRooms(r.rooms);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug, id, kind]);
  const roomNameById = Object.fromEntries(rooms.map((r) => [r.id, r.name]));

  const active = items.filter((i) => i.status !== "cancelled");
  const facturado = active.filter((i) => i.direction === "income").reduce((a, i) => a + i.totalCents, 0);
  const cobrado = active.filter((i) => i.direction === "income").reduce((a, i) => a + i.paidCents, 0);
  const pendiente = active.filter((i) => i.direction === "income").reduce((a, i) => a + i.remainingCents, 0);
  const gastos = active.filter((i) => i.direction === "expense").reduce((a, i) => a + i.totalCents, 0);
  const balance = cobrado - gastos;

  const recent = [...active].sort((a, b) => b.issueDate.localeCompare(a.issueDate)).slice(0, 6);

  // Desglose por habitación (solo en cuentas de inmueble con habitaciones).
  const roomBreakdown =
    kind === "property" && rooms.length > 0
      ? [
          ...rooms.map((rm) => ({ id: rm.id, name: rm.name, its: active.filter((i) => i.roomId === rm.id) })),
          { id: "__none__", name: "Sin habitación", its: active.filter((i) => i.roomId == null) },
        ]
          .map((g) => {
            const inc = g.its.filter((i) => i.direction === "income");
            const cob = inc.reduce((a, i) => a + i.paidCents, 0);
            const gas = g.its.filter((i) => i.direction === "expense").reduce((a, i) => a + i.totalCents, 0);
            return {
              id: g.id,
              name: g.name,
              count: g.its.length,
              facturado: inc.reduce((a, i) => a + i.totalCents, 0),
              cobrado: cob,
              gastos: gas,
              balance: cob - gas,
            };
          })
          .filter((g) => g.count > 0)
      : [];

  function afterEdit(updated: Invoice) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setEditingInvoice(null);
    setShowForm(false);
  }

  function startEdit(inv: Invoice) {
    setTab(inv.direction);
    setEditingInvoice(inv);
    setShowForm(true);
  }

  const propNameById = Object.fromEntries(propsList.map((p) => [p.id, p.title]));
  const clientNameById = Object.fromEntries(clientsList.map((c) => [c.id, c.name]));

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div>
        <Breadcrumbs items={[{ label: "Contabilidad", href: "/contabilidad" }, { label: name }]} />
        <h1 className="du-h1" style={{ margin: 0 }}>
          {name}
        </h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "var(--ui-sp-4)",
        }}
      >
        <SummaryCard label="Facturado" value={eurCents(facturado)} />
        <SummaryCard label="Cobrado" value={eurCents(cobrado)} />
        <SummaryCard label="Pendiente" value={eurCents(pendiente)} />
        <SummaryCard label="Gastos" value={eurCents(gastos)} />
        <SummaryCard label="Balance" value={eurCents(balance)} accent={balance >= 0 ? "success" : "danger"} />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--ui-sp-3)",
        }}
      >
        <div style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
          <TabButton
            active={tab === "resumen"}
            onClick={() => {
              setTab("resumen");
              setShowForm(false);
            }}
          >
            Resumen
          </TabButton>
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
        {tab !== "resumen" ? (
          <Button
            size="sm"
            onClick={() => {
              setEditingInvoice(null);
              setShowForm((v) => !v);
            }}
          >
            <Plus size={16} />
            {tab === "income" ? "Nueva factura" : "Nuevo gasto"}
          </Button>
        ) : null}
      </div>

      {showForm && tab !== "resumen" ? (
        tab === "income" ? (
          <IncomeForm
            slug={slug}
            propsList={propsList}
            clientsList={clientsList}
            initial={editingInvoice ?? undefined}
            presetPropertyId={kind === "property" ? id : undefined}
            presetClientId={kind === "client" ? id : undefined}
            onSaved={(inv) => {
              if (editingInvoice) {
                afterEdit(inv);
              } else {
                setItems((prev) => [inv, ...prev]);
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
            presetPropertyId={kind === "property" ? id : undefined}
            presetClientId={kind === "client" ? id : undefined}
            onSaved={(inv) => {
              if (editingInvoice) {
                afterEdit(inv);
              } else {
                setItems((prev) => [inv, ...prev]);
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

      {tab === "resumen" && roomBreakdown.length > 0 ? (
        <div style={{ display: "grid", gap: "var(--ui-sp-3)" }}>
          <h2 className="du-h3" style={{ margin: 0 }}>
            Por habitación
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "var(--ui-sp-4)",
            }}
          >
            {roomBreakdown.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "var(--ui-surface)",
                  border: r.id === "__none__" ? "1px dashed var(--ui-border-strong)" : "1px solid var(--ui-border)",
                  borderRadius: "var(--ui-radius-lg)",
                  padding: "var(--ui-sp-4)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                  <span className="du-muted" style={{ fontSize: 12 }}>
                    {r.count} doc{r.count === 1 ? "" : "s"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 12px", fontSize: 13, marginTop: "var(--ui-sp-2)" }}>
                  <span className="du-muted">Cobrado</span>
                  <span style={{ textAlign: "right" }}>{eurCents(r.cobrado)}</span>
                  <span className="du-muted">Gastos</span>
                  <span style={{ textAlign: "right" }}>{eurCents(r.gastos)}</span>
                </div>
                <div
                  style={{
                    marginTop: "var(--ui-sp-2)",
                    paddingTop: "var(--ui-sp-2)",
                    borderTop: "1px solid var(--ui-border)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span className="du-muted" style={{ fontSize: 13 }}>
                    Balance
                  </span>
                  <span style={{ fontWeight: 700, color: r.balance >= 0 ? "var(--ui-success)" : "var(--ui-danger)" }}>
                    {eurCents(r.balance)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "resumen" ? (
        <Card padded={false}>
          {recent.length === 0 ? (
            <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
              Sin movimientos todavía.
            </p>
          ) : (
            <div>
              {recent.map((inv, i) => (
                <div
                  key={inv.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "var(--ui-sp-4)",
                    padding: "var(--ui-sp-3) var(--ui-sp-4)",
                    borderTop: i > 0 ? "1px solid var(--ui-border)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-3)" }}>
                    <Badge variant={inv.direction === "income" ? "success" : "default"}>
                      {inv.direction === "income" ? "Factura" : "Gasto"}
                    </Badge>
                    <span>{inv.concept ?? "—"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-3)" }}>
                    <span className="du-muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                      {new Date(inv.issueDate).toLocaleDateString("es-ES")}
                    </span>
                    <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{eurCents(inv.totalCents)}</span>
                    <Badge variant={STATUS_VARIANT[inv.status]}>{STATUS_LABEL[inv.status]}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <InvoiceTable
          slug={slug}
          items={items}
          direction={tab}
          propNameById={propNameById}
          clientNameById={clientNameById}
          roomNameById={roomNameById}
          showPropertyColumn={kind !== "property"}
          showClientColumn={kind !== "client"}
          onEdit={startEdit}
          onChange={setItems}
          emptyMessage={tab === "income" ? "Aún no se han emitido facturas." : "Aún no hay gastos registrados."}
        />
      )}
    </div>
  );
}
