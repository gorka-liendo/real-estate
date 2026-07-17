import { Hono } from "hono";
import {
  authMiddleware,
  requireMembership,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import { createClientSchema, updateClientSchema } from "./clients.schema.js";
import * as service from "./clients.service.js";

// Rutas del módulo Clientes. Se montan bajo /tenant/clients, así que el tenant
// ya está resuelto (tenantMiddleware) y en contexto. Cadena de guardas:
//   tenantMiddleware (en app.ts) → auth → membership → módulo 'clients'.
export const clients = new Hono<MemberEnv>();

clients.use("*", authMiddleware);
clients.use("*", requireMembership);
clients.use("*", requireModule("clients"));

clients.get("/", async (c) => {
  return c.json({ clients: await service.listClients() });
});

clients.post("/", async (c) => {
  const body = createClientSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  }
  return c.json({ client: await service.createClient(body.data) }, 201);
});

clients.patch("/:id", async (c) => {
  const body = updateClientSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  }
  const updated = await service.updateClient(c.req.param("id"), body.data);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ client: updated });
});

clients.delete("/:id", async (c) => {
  const ok = await service.deleteClient(c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.body(null, 204);
});
