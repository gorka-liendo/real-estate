import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { getStorage, tenantKey } from "@rep/storage";
import { renderInvoicePdf } from "./invoice-pdf.js";
import {
  authMiddleware,
  requireMembership,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import {
  createExpenseSchema,
  createIncomeSchema,
  createPaymentSchema,
  updateInvoiceSchema,
} from "./invoices.schema.js";
import * as service from "./invoices.service.js";

// Contabilidad — facturas de gasto (expense) y emitidas (income), con pagos.
// Bajo /tenant/invoices, gateado por 'accounting'. Absorbe lo que antes era
// el módulo expenses (property_expenses): un gasto sigue admitiendo adjuntar
// una factura, pero ya no exige estar ligado a un inmueble.
export const invoices = new Hono<MemberEnv>();

invoices.use("*", authMiddleware);
invoices.use("*", requireMembership);
invoices.use("*", requireModule("accounting"));

const DOC_ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_DOC_BYTES = 10 * 1024 * 1024;

invoices.get("/", async (c) => {
  const q = c.req.query();
  const list = await service.listInvoices({
    direction: q.direction as "expense" | "income" | undefined,
    propertyId: q.propertyId,
    roomId: q.roomId,
    clientId: q.clientId,
    status: q.status,
  });
  return c.json({ invoices: list });
});

invoices.get("/:id", async (c) => {
  const invoice = await service.getInvoice(c.req.param("id"));
  if (!invoice) return c.json({ error: "not_found" }, 404);
  return c.json({ invoice });
});

// Gasto: multipart (campos + factura opcional). propertyId/clientId son
// OPCIONALES — un gasto general de la agencia no cuelga de ningún piso.
invoices.post("/expense", async (c) => {
  const body = await c.req.parseBody();
  const parsed = createExpenseSchema.safeParse({
    propertyId: body["propertyId"] || undefined,
    roomId: body["roomId"] || undefined,
    clientId: body["clientId"] || undefined,
    vendorName: body["vendorName"] || undefined,
    category: body["category"] || undefined,
    concept: body["concept"] || undefined,
    amount: body["amount"],
    issueDate: body["issueDate"],
    dueDate: body["dueDate"] || undefined,
    status: body["status"] || undefined,
    notes: body["notes"] || undefined,
  });
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  const result = await service.createExpense(parsed.data);
  if (!result.ok) return c.json({ error: result.error }, 400);
  let invoice = result.invoice;

  const file = body["file"];
  if (file instanceof File && file.size > 0) {
    const ext = DOC_ALLOWED[file.type];
    if (!ext) return c.json({ error: "invalid_file_type" }, 400);
    if (file.size > MAX_DOC_BYTES) return c.json({ error: "file_too_large" }, 400);
    const key = tenantKey(c.get("tenant").id, "invoices", invoice.id, `${randomUUID()}.${ext}`);
    const stored = await getStorage().put(key, Buffer.from(await file.arrayBuffer()), file.type);
    const updated = await service.attachFile(invoice.id, stored.url, file.name || "factura");
    if (updated) invoice = { ...invoice, ...updated };
  }

  return c.json({ invoice }, 201);
});

// Factura emitida: JSON, sin adjunto (el PDF se genera al emitir).
invoices.post("/income", async (c) => {
  const body = createIncomeSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const result = await service.createIncome(body.data);
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ invoice: result.invoice }, 201);
});

invoices.patch("/:id", async (c) => {
  const body = updateInvoiceSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const result = await service.updateInvoice(c.req.param("id"), body.data);
  if (!result.ok) {
    return c.json({ error: result.error }, result.error === "not_found" ? 404 : 400);
  }
  return c.json({ invoice: result.invoice });
});

invoices.delete("/:id", async (c) => {
  const result = await service.deleteInvoice(c.req.param("id"));
  if (!result.ok) {
    return c.json({ error: result.error }, result.error === "has_payments" ? 409 : 404);
  }
  return c.body(null, 204);
});

// PDF solo para facturas emitidas (income) — un gasto ya tiene su propio
// adjunto (fileUrl), no algo que generemos nosotros.
invoices.get("/:id/pdf", async (c) => {
  const invoice = await service.getInvoice(c.req.param("id"));
  if (!invoice) return c.json({ error: "not_found" }, 404);
  if (invoice.direction !== "income") return c.json({ error: "not_an_income_invoice" }, 400);

  const ctx = await service.getInvoicePdfContext(invoice);
  const pdf = await renderInvoicePdf(invoice, c.get("tenant"), ctx);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.number ?? invoice.id}.pdf"`,
    },
  });
});

invoices.post("/:id/payments", async (c) => {
  const body = createPaymentSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const result = await service.addPayment(c.req.param("id"), body.data);
  if (!result.ok) {
    return c.json({ error: result.error }, result.error === "not_found" ? 404 : 400);
  }
  return c.json({ invoice: result.invoice }, 201);
});
