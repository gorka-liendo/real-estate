import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, tenants } from "@rep/db";
import {
  authMiddleware,
  requireMembership,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import { siteConfigSchema } from "./site.schema.js";

// Editor del contenido del micrositio (site_config) — bajo /tenant/site.
// El tenant se edita a sí mismo: id del contexto, tras auth + membership + módulo.
export const site = new Hono<MemberEnv>();

site.use("*", authMiddleware);
site.use("*", requireMembership);
site.use("*", requireModule("microsite"));

site.get("/", (c) => {
  return c.json({ siteConfig: c.get("tenant").siteConfig });
});

site.patch("/", async (c) => {
  const body = siteConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);

  const [row] = await db
    .update(tenants)
    .set({ siteConfig: body.data })
    .where(eq(tenants.id, c.get("tenant").id))
    .returning();
  return c.json({ siteConfig: row!.siteConfig });
});
