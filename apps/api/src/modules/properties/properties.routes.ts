import { Hono } from "hono";
import {
  authMiddleware,
  requireMembership,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import { createPropertySchema, updatePropertySchema } from "./properties.schema.js";
import * as service from "./properties.service.js";

// Rutas del módulo Propiedades, bajo /tenant/properties.
// Guardas: tenantMiddleware (app.ts) → auth → membership → módulo 'properties'.
export const properties = new Hono<MemberEnv>();

properties.use("*", authMiddleware);
properties.use("*", requireMembership);
properties.use("*", requireModule("properties"));

properties.get("/", async (c) => {
  return c.json({ properties: await service.listProperties() });
});

properties.post("/", async (c) => {
  const body = createPropertySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  return c.json({ property: await service.createProperty(body.data) }, 201);
});

properties.patch("/:id", async (c) => {
  const body = updatePropertySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const updated = await service.updateProperty(c.req.param("id"), body.data);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ property: updated });
});

properties.delete("/:id", async (c) => {
  const ok = await service.deleteProperty(c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.body(null, 204);
});
