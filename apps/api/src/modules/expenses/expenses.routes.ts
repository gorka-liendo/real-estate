import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  properties,
  propertyExpenses,
  tenantDb,
  type PropertyExpense,
} from "@rep/db";
import { getStorage, tenantKey } from "@rep/storage";
import {
  authMiddleware,
  requireMembership,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";

// Gastos y facturas por inmueble (privado, dashboard). Bajo /tenant/expenses,
// gateado por 'rentals' (la gestión económica vive en ese módulo). La factura
// se sube como multipart y se guarda en @rep/storage (fs local / R2 en prod).
export const expenses = new Hono<MemberEnv>();

expenses.use("*", authMiddleware);
expenses.use("*", requireMembership);
expenses.use("*", requireModule("rentals"));

// Facturas: PDF o imagen (foto de la factura), máx. 10 MB.
const DOC_ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_DOC_BYTES = 10 * 1024 * 1024;

const CATEGORY_VALUES = [
  "water",
  "electricity",
  "gas",
  "community",
  "taxes",
  "derrama",
  "maintenance",
  "insurance",
  "other",
] as const;

// El POST llega como multipart (campos de texto + archivo opcional).
const expenseFields = z.object({
  propertyId: z.uuid(),
  category: z.enum(CATEGORY_VALUES),
  // Importe en euros con decimales ("43.27") → céntimos.
  amount: z.coerce.number().positive().max(10_000_000),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  concept: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

expenses.get("/", async (c) => {
  const propertyId = c.req.query("propertyId");
  const where = propertyId ? eq(propertyExpenses.propertyId, propertyId) : undefined;
  const rows = (await tenantDb().select(propertyExpenses, where)) as PropertyExpense[];
  rows.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
  return c.json({ expenses: rows });
});

expenses.post("/", async (c) => {
  const body = await c.req.parseBody();
  const parsed = expenseFields.safeParse({
    propertyId: body["propertyId"],
    category: body["category"],
    amount: body["amount"],
    expenseDate: body["expenseDate"],
    concept: body["concept"] || undefined,
    notes: body["notes"] || undefined,
  });
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  // El inmueble debe ser DEL tenant.
  const prop = await tenantDb().select(properties, eq(properties.id, parsed.data.propertyId));
  if (prop.length === 0) return c.json({ error: "property_not_found" }, 400);

  // Factura adjunta (opcional).
  let fileUrl: string | null = null;
  let fileName: string | null = null;
  const file = body["file"];
  if (file instanceof File && file.size > 0) {
    const ext = DOC_ALLOWED[file.type];
    if (!ext) return c.json({ error: "invalid_file_type" }, 400);
    if (file.size > MAX_DOC_BYTES) return c.json({ error: "file_too_large" }, 400);
    const key = tenantKey(
      c.get("tenant").id,
      "expenses",
      parsed.data.propertyId,
      `${randomUUID()}.${ext}`,
    );
    const stored = await getStorage().put(key, Buffer.from(await file.arrayBuffer()), file.type);
    fileUrl = stored.url;
    fileName = file.name || null;
  }

  const rows = (await tenantDb()
    .insert(propertyExpenses, {
      propertyId: parsed.data.propertyId,
      category: parsed.data.category,
      concept: parsed.data.concept ?? null,
      amountCents: Math.round(parsed.data.amount * 100),
      expenseDate: parsed.data.expenseDate,
      fileUrl,
      fileName,
      notes: parsed.data.notes ?? null,
    })
    .returning()) as PropertyExpense[];
  return c.json({ expense: rows[0]! }, 201);
});

expenses.delete("/:id", async (c) => {
  const rows = (await tenantDb()
    .delete(propertyExpenses, and(eq(propertyExpenses.id, c.req.param("id"))))
    .returning()) as PropertyExpense[];
  if (rows.length === 0) return c.json({ error: "not_found" }, 404);
  return c.body(null, 204);
});
