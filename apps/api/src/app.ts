import { Hono } from "hono";
import { logger } from "hono/logger";
import { subscriptions, tenantDb } from "@rep/db";
import { tenantMiddleware, type TenantEnv } from "./middlewares/tenant.middleware.js";

// app sin listen() — importable en tests (mismo patrón que app.ts/server.ts en Express)
export const app = new Hono();

app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok" }));

// --- rutas tenant-scoped: todo lo de aquí dentro tiene tenant en contexto ---
const tenant = new Hono<TenantEnv>();
tenant.use("*", tenantMiddleware);

tenant.get("/", (c) => {
  const t = c.get("tenant");
  return c.json({ id: t.id, slug: t.slug, name: t.name, brandConfig: t.brandConfig });
});

tenant.get("/subscriptions", async (c) => {
  const rows = await tenantDb().select(subscriptions);
  return c.json(rows);
});

app.route("/tenant", tenant);
