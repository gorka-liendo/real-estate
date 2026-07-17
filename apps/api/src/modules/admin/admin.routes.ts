import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, tenants } from "@rep/db";
import {
  getActiveModules,
  listCatalog,
  ModuleNotFoundError,
  setTenantModule,
} from "@rep/modules";
import { authMiddleware, type AuthEnv } from "../../middlewares/auth.middleware.js";
import { requirePlatformAdmin } from "../../middlewares/admin.middleware.js";

// Panel de superadmin: gestión de tenants y de sus módulos.
// El cobro es por factura (offline) — aquí solo se activa/desactiva.

export const admin = new Hono<AuthEnv>();
admin.use("*", authMiddleware);
admin.use("*", requirePlatformAdmin);

admin.get("/catalog", async (c) => c.json({ modules: await listCatalog() }));

admin.get("/tenants", async (c) => {
  const all = await db.select().from(tenants).orderBy(tenants.slug);
  const withModules = await Promise.all(
    all.map(async (t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      customDomain: t.customDomain,
      theme: t.brandConfig.theme ?? "dwell",
      activeModules: await getActiveModules(t.id),
    })),
  );
  return c.json({ tenants: withModules });
});

// Asignar el tema (design system) de una inmobiliaria. Lo hace la plataforma.
const themeSchema = z.object({ theme: z.string().min(1).max(60) });

admin.put("/tenants/:slug/theme", async (c) => {
  const body = themeSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: "invalid_body", detail: "se espera { theme: string }" }, 400);
  }
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, c.req.param("slug")));
  if (!tenant) return c.json({ error: "tenant_not_found" }, 404);

  const [row] = await db
    .update(tenants)
    .set({ brandConfig: { ...tenant.brandConfig, theme: body.data.theme } })
    .where(eq(tenants.id, tenant.id))
    .returning();
  return c.json({ tenant: tenant.slug, theme: row!.brandConfig.theme });
});

const toggleSchema = z.object({ active: z.boolean() });

admin.put("/tenants/:slug/modules/:code", async (c) => {
  const body = toggleSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: "invalid_body", detail: "se espera { active: boolean }" }, 400);
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, c.req.param("slug")));
  if (!tenant) return c.json({ error: "tenant_not_found" }, 404);

  try {
    await setTenantModule(tenant.id, c.req.param("code"), body.data.active);
  } catch (err) {
    if (err instanceof ModuleNotFoundError) {
      return c.json({ error: "module_not_found", module: c.req.param("code") }, 404);
    }
    throw err;
  }

  return c.json({
    tenant: tenant.slug,
    module: c.req.param("code"),
    active: body.data.active,
    activeModules: await getActiveModules(tenant.id),
  });
});
