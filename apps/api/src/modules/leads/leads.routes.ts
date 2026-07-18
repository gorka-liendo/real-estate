import { Hono } from "hono";
import { requireModule } from "../../middlewares/module.middleware.js";
import type { TenantEnv } from "../../middlewares/tenant.middleware.js";
import { getPublishedProperty } from "../properties/properties.service.js";
import { createLeadSchema } from "./leads.schema.js";
import * as service from "./leads.service.js";
import { allowPublicCapture, clientIp } from "./public-intake.js";

// Captación pública desde el micrositio. Se monta bajo /tenant/leads: el tenant
// ya está resuelto (tenantMiddleware en app.ts). Gateado por 'microsite' (la
// superficie de captación); el lead se guarda aunque el tenant no tenga el CRM.
// SIN auth: es un formulario público. Cuota compartida: ver public-intake.ts.
export const leads = new Hono<TenantEnv>();

leads.use("*", requireModule("microsite"));

leads.post("/", async (c) => {
  const parsed = createLeadSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  // Honeypot relleno → bot. Fingimos éxito (204) sin insertar.
  if (parsed.data.company) return c.body(null, 204);

  if (!allowPublicCapture(c.get("tenant").id, clientIp(c))) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const { company: _company, ...data } = parsed.data;

  // No confiar en el propertyId del cliente: solo lo conservamos si es un
  // inmueble PUBLICADO de ESTE tenant (getPublishedProperty va por tenantDb).
  // Si no, lo descartamos para no guardar un id colgante o cross-tenant.
  if (data.propertyId && !(await getPublishedProperty(data.propertyId))) {
    data.propertyId = undefined;
  }

  const lead = await service.createLead(data);
  return c.json({ ok: true, id: lead.id }, 201);
});
