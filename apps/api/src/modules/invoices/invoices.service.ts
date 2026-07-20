import { and, eq, inArray, like } from "drizzle-orm";
import {
  clients,
  invoicePayments,
  invoices,
  properties,
  rentals,
  tenantDb,
  type Invoice,
  type InvoicePayment,
} from "@rep/db";
import type {
  CreateExpenseInput,
  CreateIncomeInput,
  CreatePaymentInput,
  UpdateInvoiceInput,
} from "./invoices.schema.js";

export type InvoiceWithPayments = Invoice & {
  payments: InvoicePayment[];
  paidCents: number;
  remainingCents: number;
  overdue: boolean; // derivado: pending + dueDate pasada — nunca persistido
};

const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number) => Math.round(n);

function decorate(invoice: Invoice, payments: InvoicePayment[]): InvoiceWithPayments {
  const paidCents = payments.reduce((a, p) => a + p.amountCents, 0);
  const today = toDateOnly(new Date());
  return {
    ...invoice,
    payments: payments.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime()),
    paidCents,
    remainingCents: Math.max(0, invoice.totalCents - paidCents),
    overdue: invoice.status === "pending" && !!invoice.dueDate && invoice.dueDate < today,
  };
}

export type ListFilters = {
  direction?: "expense" | "income";
  propertyId?: string;
  clientId?: string;
  status?: string;
};

export async function listInvoices(filters: ListFilters): Promise<InvoiceWithPayments[]> {
  const conds = [
    filters.direction ? eq(invoices.direction, filters.direction) : null,
    filters.propertyId ? eq(invoices.propertyId, filters.propertyId) : null,
    filters.clientId ? eq(invoices.clientId, filters.clientId) : null,
    filters.status ? eq(invoices.status, filters.status as Invoice["status"]) : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  const rows = (await tenantDb().select(
    invoices,
    conds.length > 0 ? and(...conds) : undefined,
  )) as Invoice[];
  if (rows.length === 0) return [];

  const pays = (await tenantDb().select(
    invoicePayments,
    inArray(invoicePayments.invoiceId, rows.map((r) => r.id)),
  )) as InvoicePayment[];

  return rows
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
    .map((r) => decorate(r, pays.filter((p) => p.invoiceId === r.id)));
}

export async function getInvoice(id: string): Promise<InvoiceWithPayments | null> {
  const rows = (await tenantDb().select(invoices, eq(invoices.id, id))) as Invoice[];
  const invoice = rows[0];
  if (!invoice) return null;
  const pays = (await tenantDb().select(
    invoicePayments,
    eq(invoicePayments.invoiceId, id),
  )) as InvoicePayment[];
  return decorate(invoice, pays);
}

// Los tres son opcionales por diseño — validamos que, SI vienen, sean del tenant.
async function assertBelongsToTenant(
  propertyId?: string,
  clientId?: string,
  rentalId?: string,
): Promise<"invalid_property" | "invalid_client" | "invalid_rental" | null> {
  if (propertyId) {
    const rows = await tenantDb().select(properties, eq(properties.id, propertyId));
    if (rows.length === 0) return "invalid_property";
  }
  if (clientId) {
    const rows = await tenantDb().select(clients, eq(clients.id, clientId));
    if (rows.length === 0) return "invalid_client";
  }
  if (rentalId) {
    const rows = await tenantDb().select(rentals, eq(rentals.id, rentalId));
    if (rows.length === 0) return "invalid_rental";
  }
  return null;
}

export type CreateResult =
  | { ok: true; invoice: InvoiceWithPayments }
  | { ok: false; error: "invalid_property" | "invalid_client" | "invalid_rental" };

export async function createExpense(input: CreateExpenseInput): Promise<CreateResult> {
  const invalid = await assertBelongsToTenant(input.propertyId, input.clientId);
  if (invalid) return { ok: false, error: invalid };

  const totalCents = round(input.amount * 100);
  const rows = (await tenantDb()
    .insert(invoices, {
      direction: "expense",
      status: input.status,
      propertyId: input.propertyId ?? null,
      clientId: input.clientId ?? null,
      vendorName: input.vendorName ?? null,
      category: input.category,
      concept: input.concept ?? null,
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? null,
      subtotalCents: totalCents,
      taxRateBps: 0,
      taxCents: 0,
      totalCents,
      notes: input.notes ?? null,
    })
    .returning()) as Invoice[];
  const invoice = rows[0]!;

  // Gasto ya pagado (comportamiento por defecto, como el flujo rápido de
  // siempre): registrar el pago del total en el momento de crear.
  const pays: InvoicePayment[] = [];
  if (input.status === "paid") {
    const p = (await tenantDb()
      .insert(invoicePayments, {
        invoiceId: invoice.id,
        amountCents: totalCents,
        paidAt: new Date(`${input.issueDate}T12:00:00Z`),
        method: "other",
      })
      .returning()) as InvoicePayment[];
    pays.push(p[0]!);
  }

  return { ok: true, invoice: decorate(invoice, pays) };
}

/** Adjunta la factura subida (multipart) a un gasto ya creado. */
export async function attachFile(
  id: string,
  fileUrl: string,
  fileName: string,
): Promise<Invoice | null> {
  const rows = (await tenantDb()
    .update(invoices, { fileUrl, fileName }, eq(invoices.id, id))
    .returning()) as Invoice[];
  return rows[0] ?? null;
}

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${year}-`;
  const existing = (await tenantDb().select(
    invoices,
    and(eq(invoices.direction, "income"), like(invoices.number, `${prefix}%`)),
  )) as Invoice[];
  const seq = existing.length + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createIncome(input: CreateIncomeInput): Promise<CreateResult> {
  const invalid = await assertBelongsToTenant(input.propertyId, input.clientId, input.rentalId);
  if (invalid) return { ok: false, error: invalid };

  const subtotalCents = round(input.amount * 100);
  const taxRateBps = round(input.taxRatePercent * 100);
  const taxCents = round((subtotalCents * taxRateBps) / 10_000);
  const totalCents = subtotalCents + taxCents;

  const rows = (await tenantDb()
    .insert(invoices, {
      direction: "income",
      status: "pending",
      propertyId: input.propertyId ?? null,
      clientId: input.clientId ?? null,
      rentalId: input.rentalId ?? null,
      category: input.category,
      number: await nextInvoiceNumber(),
      concept: input.concept,
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? null,
      subtotalCents,
      taxRateBps,
      taxCents,
      totalCents,
      notes: input.notes ?? null,
    })
    .returning()) as Invoice[];

  return { ok: true, invoice: decorate(rows[0]!, []) };
}

export async function updateInvoice(
  id: string,
  input: UpdateInvoiceInput,
): Promise<InvoiceWithPayments | null> {
  const rows = (await tenantDb()
    .update(invoices, input, eq(invoices.id, id))
    .returning()) as Invoice[];
  if (!rows[0]) return null;
  return getInvoice(id);
}

export type PaymentResult =
  | { ok: true; invoice: InvoiceWithPayments }
  | { ok: false; error: "not_found" | "invoice_not_payable" };

export async function addPayment(
  id: string,
  input: CreatePaymentInput,
): Promise<PaymentResult> {
  const current = await getInvoice(id);
  if (!current) return { ok: false, error: "not_found" };
  if (current.status === "cancelled" || current.status === "draft") {
    return { ok: false, error: "invoice_not_payable" };
  }

  await tenantDb().insert(invoicePayments, {
    invoiceId: id,
    amountCents: round(input.amount * 100),
    paidAt: input.paidAt ?? new Date(),
    method: input.method,
    notes: input.notes ?? null,
  });

  const updated = await getInvoice(id);
  if (updated!.paidCents >= updated!.totalCents && updated!.status !== "paid") {
    await tenantDb().update(invoices, { status: "paid" }, eq(invoices.id, id));
    return { ok: true, invoice: (await getInvoice(id))! };
  }
  return { ok: true, invoice: updated! };
}

export async function getInvoicePdfContext(
  invoice: Invoice,
): Promise<{ clientName?: string; clientEmail?: string; propertyTitle?: string }> {
  const ctx: { clientName?: string; clientEmail?: string; propertyTitle?: string } = {};
  if (invoice.clientId) {
    const rows = (await tenantDb().select(clients, eq(clients.id, invoice.clientId))) as Array<{
      name: string;
      email: string | null;
    }>;
    if (rows[0]) {
      ctx.clientName = rows[0].name;
      ctx.clientEmail = rows[0].email ?? undefined;
    }
  }
  if (invoice.propertyId) {
    const rows = (await tenantDb().select(
      properties,
      eq(properties.id, invoice.propertyId),
    )) as Array<{ title: string }>;
    if (rows[0]) ctx.propertyTitle = rows[0].title;
  }
  return ctx;
}

export type DeleteResult = { ok: true } | { ok: false; error: "not_found" | "has_payments" };

export async function deleteInvoice(id: string): Promise<DeleteResult> {
  const pays = await tenantDb().select(invoicePayments, eq(invoicePayments.invoiceId, id));
  if (pays.length > 0) return { ok: false, error: "has_payments" };
  const rows = await tenantDb().delete(invoices, eq(invoices.id, id)).returning();
  if (rows.length === 0) return { ok: false, error: "not_found" };
  return { ok: true };
}
