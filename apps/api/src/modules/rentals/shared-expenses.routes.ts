import { isAiConfigured } from "@rep/ai";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { properties, tenantDb } from "@rep/db";
import {
  authMiddleware,
  requireMembership,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import { extractSharedExpense } from "./shared-expenses.extract.js";
import {
  createSharedExpenseSchema,
  shareConfigSchema,
  updateSharedExpenseSchema,
} from "./shared-expenses.schema.js";
import { renderSettlementPdf } from "./settlement-pdf.js";
import * as service from "./shared-expenses.service.js";

const EXTRACT_TYPES: Record<string, boolean> = {
  "application/pdf": true,
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
};

// Gastos compartidos + liquidación de un piso por habitaciones. Bajo
// /tenant/shared-expenses. Guardas: tenant → auth → membership → módulo 'rentals'.
export const sharedExpenses = new Hono<MemberEnv>();

sharedExpenses.use("*", authMiddleware);
sharedExpenses.use("*", requireMembership);
sharedExpenses.use("*", requireModule("rentals"));

// Liquidación del piso: reparto de cada gasto + totales por inquilino.
// GET /tenant/shared-expenses/settlement?propertyId=xxx
sharedExpenses.get("/settlement", async (c) => {
  const propertyId = c.req.query("propertyId");
  if (!propertyId) return c.json({ error: "missing_property" }, 400);
  return c.json(await service.getPropertySettlement(propertyId));
});

// PDF de la liquidación (para pasar a los inquilinos).
// GET /tenant/shared-expenses/settlement/pdf?propertyId=xxx
sharedExpenses.get("/settlement/pdf", async (c) => {
  const propertyId = c.req.query("propertyId");
  if (!propertyId) return c.json({ error: "missing_property" }, 400);
  const props = await tenantDb().select(properties, eq(properties.id, propertyId));
  if (props.length === 0) return c.json({ error: "not_found" }, 404);
  const settlement = await service.getPropertySettlement(propertyId);
  const pdf = await renderSettlementPdf(settlement, {
    tenant: c.get("tenant"),
    propertyTitle: props[0]!.title,
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="liquidacion-${props[0]!.title.replace(/[^\w]+/g, "-").toLowerCase()}.pdf"`,
    },
  });
});

// Visibilidad de la liquidación (control de la inmobiliaria).
// GET /tenant/shared-expenses/share?propertyId=xxx
sharedExpenses.get("/share", async (c) => {
  const propertyId = c.req.query("propertyId");
  if (!propertyId) return c.json({ error: "missing_property" }, 400);
  return c.json(await service.getShareConfig(propertyId));
});

sharedExpenses.put("/share", async (c) => {
  const body = shareConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const { propertyId, ...rest } = body.data;
  return c.json(await service.setShareConfig(propertyId, rest));
});

// GET /tenant/shared-expenses?propertyId=xxx
sharedExpenses.get("/", async (c) => {
  const propertyId = c.req.query("propertyId");
  if (!propertyId) return c.json({ error: "missing_property" }, 400);
  return c.json({ expenses: await service.listSharedExpenses(propertyId) });
});

// Extrae con IA (Haiku) los datos de una factura subida para pre-rellenar el
// formulario. NO guarda nada — el agente revisa y confirma. Multipart.
sharedExpenses.post("/extract", async (c) => {
  if (!isAiConfigured()) return c.json({ error: "ai_not_configured" }, 503);
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "no_file" }, 400);
  if (!EXTRACT_TYPES[file.type]) return c.json({ error: "invalid_type" }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: "file_too_large" }, 400);
  try {
    const data = await extractSharedExpense({
      data: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
    });
    return c.json({ extracted: data });
  } catch {
    return c.json({ error: "extract_failed" }, 502);
  }
});

sharedExpenses.post("/", async (c) => {
  const body = createSharedExpenseSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const result = await service.createSharedExpense(body.data);
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ expense: result.expense }, 201);
});

sharedExpenses.patch("/:id", async (c) => {
  const body = updateSharedExpenseSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const updated = await service.updateSharedExpense(c.req.param("id"), body.data);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ expense: updated });
});

sharedExpenses.delete("/:id", async (c) => {
  const ok = await service.deleteSharedExpense(c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
