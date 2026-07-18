import { Hono } from "hono";
import { requireModule } from "../../middlewares/module.middleware.js";
import type { TenantEnv } from "../../middlewares/tenant.middleware.js";
import { allowPublicCapture, clientIp } from "../leads/public-intake.js";
import { createValuationSchema } from "./valuations.schema.js";
import * as service from "./valuations.service.js";

// Widget "Valora tu piso gratis" (producto 04, pata no bloqueada). Público, se
// monta bajo /tenant/valuations con el tenant ya resuelto. Gateado por el módulo
// comercial 'valuation' (activable por tenant desde /admin). La cuota anti-abuso
// es COMPARTIDA con el formulario de contacto: ver leads/public-intake.ts.
export const valuations = new Hono<TenantEnv>();

valuations.use("*", requireModule("valuation"));

valuations.post("/", async (c) => {
  const parsed = createValuationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  // Honeypot relleno → bot. Fingimos éxito sin insertar (sin estimación, para
  // no regalar datos al scraper).
  if (parsed.data.company) return c.body(null, 204);

  if (!allowPublicCapture(c.get("tenant").id, clientIp(c))) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const { company: _company, ...data } = parsed.data;
  const estimate = await service.estimateValue(data);
  const lead = await service.createValuationLead(data, estimate);
  return c.json({ ok: true, id: lead.id, estimate }, 201);
});
