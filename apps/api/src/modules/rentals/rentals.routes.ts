import { Hono } from "hono";
import {
  authMiddleware,
  requireMembership,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import {
  createRentalSchema,
  paymentSchema,
  PERIOD_RE,
  updateRentalSchema,
} from "./rentals.schema.js";
import * as service from "./rentals.service.js";

// Alquileres (privado, dashboard). Bajo /tenant/rentals.
// Guardas: tenant → auth → membership → módulo 'rentals'.
export const rentals = new Hono<MemberEnv>();

rentals.use("*", authMiddleware);
rentals.use("*", requireMembership);
rentals.use("*", requireModule("rentals"));

rentals.get("/", async (c) => {
  return c.json({ rentals: await service.listRentals() });
});

// Detalle de gestión de un contrato (cobros + inmueble + inquilino/propietario).
rentals.get("/:id", async (c) => {
  const detail = await service.getRentalDetail(c.req.param("id"));
  if (!detail) return c.json({ error: "not_found" }, 404);
  return c.json(detail);
});

rentals.post("/", async (c) => {
  const body = createRentalSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const result = await service.createRental(body.data);
  if (!result.ok) {
    return c.json({ error: result.error }, result.error === "active_rental_exists" ? 409 : 400);
  }
  return c.json({ rental: result.rental }, 201);
});

rentals.patch("/:id", async (c) => {
  const body = updateRentalSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const updated = await service.updateRental(c.req.param("id"), body.data);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ rental: updated });
});

// Upsert del cobro de un mes: PUT /tenant/rentals/:id/payments/2026-07
rentals.put("/:id/payments/:period", async (c) => {
  const period = c.req.param("period");
  if (!PERIOD_RE.test(period)) return c.json({ error: "invalid_period" }, 400);
  const body = paymentSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const payment = await service.upsertPayment(c.req.param("id"), period, body.data);
  if (!payment) return c.json({ error: "not_found" }, 404);
  return c.json({ payment });
});
