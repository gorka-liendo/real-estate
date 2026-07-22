import { Hono } from "hono";
import {
  authMiddleware,
  requireMembership,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import {
  createSharedExpenseSchema,
  updateSharedExpenseSchema,
} from "./shared-expenses.schema.js";
import * as service from "./shared-expenses.service.js";

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

// GET /tenant/shared-expenses?propertyId=xxx
sharedExpenses.get("/", async (c) => {
  const propertyId = c.req.query("propertyId");
  if (!propertyId) return c.json({ error: "missing_property" }, 400);
  return c.json({ expenses: await service.listSharedExpenses(propertyId) });
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
