import { Hono } from "hono";
import { requireModule } from "../../middlewares/module.middleware.js";
import type { TenantEnv } from "../../middlewares/tenant.middleware.js";
import { createLeadSchema } from "./leads.schema.js";
import * as service from "./leads.service.js";
import { allowLead } from "./leads.throttle.js";

// Captación pública desde el micrositio. Se monta bajo /tenant/leads: el tenant
// ya está resuelto (tenantMiddleware en app.ts). Gateado por 'microsite' (la
// superficie de captación); el lead se guarda aunque el tenant no tenga el CRM.
// SIN auth: es un formulario público.
export const leads = new Hono<TenantEnv>();

leads.use("*", requireModule("microsite"));

leads.post("/", async (c) => {
  const parsed = createLeadSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  // Honeypot relleno → bot. Fingimos éxito (204) sin insertar.
  if (parsed.data.company) return c.body(null, 204);

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowLead(`${c.get("tenant").id}:${ip}`)) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const { company: _company, ...data } = parsed.data;
  const lead = await service.createLead(data);
  return c.json({ ok: true, id: lead.id }, 201);
});
