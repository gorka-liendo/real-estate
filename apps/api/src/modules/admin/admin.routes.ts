import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "@rep/auth";
import { clients, db, memberships, properties, rentals, tenants, user, visits } from "@rep/db";
import {
  getActiveModules,
  listCatalog,
  ModuleNotFoundError,
  setTenantModule,
} from "@rep/modules";
import { authMiddleware, type AuthEnv } from "../../middlewares/auth.middleware.js";
import { requirePlatformAdmin } from "../../middlewares/admin.middleware.js";
import { saveSiteMedia } from "../site/site.media.js";
import { siteConfigSchema } from "../site/site.schema.js";

// Panel de superadmin: gestión de tenants y de sus módulos.
// El cobro es por factura (offline) — aquí solo se activa/desactiva.

export const admin = new Hono<AuthEnv>();
admin.use("*", authMiddleware);
admin.use("*", requirePlatformAdmin);

admin.get("/catalog", async (c) => c.json({ modules: await listCatalog() }));

admin.get("/tenants", async (c) => {
  const all = await db.select().from(tenants).orderBy(tenants.slug);

  // Stats por tenant en 4 group-by (no N+1). Superadmin: db directa es legítima.
  const [propCounts, clientCounts, visitCounts, rentalCounts] = await Promise.all([
    db.select({ tenantId: properties.tenantId, n: count() }).from(properties).groupBy(properties.tenantId),
    db.select({ tenantId: clients.tenantId, n: count() }).from(clients).groupBy(clients.tenantId),
    db.select({ tenantId: visits.tenantId, n: count() }).from(visits).groupBy(visits.tenantId),
    db
      .select({ tenantId: rentals.tenantId, n: count() })
      .from(rentals)
      .where(eq(rentals.status, "active"))
      .groupBy(rentals.tenantId),
  ]);
  const lookup = (rows: Array<{ tenantId: string; n: number }>, id: string) =>
    rows.find((r) => r.tenantId === id)?.n ?? 0;

  const withModules = await Promise.all(
    all.map(async (t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      customDomain: t.customDomain,
      theme: t.brandConfig.theme ?? "dwell",
      activeModules: await getActiveModules(t.id),
      stats: {
        properties: lookup(propCounts, t.id),
        clients: lookup(clientCounts, t.id),
        visits: lookup(visitCounts, t.id),
        activeRentals: lookup(rentalCounts, t.id),
      },
    })),
  );
  return c.json({ tenants: withModules });
});

// Alta de inmobiliaria desde el panel: tenant + usuario owner + membership.
// (Hasta ahora solo existía vía seed — el panel no podía operar de verdad.)
const createTenantSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "slug: minúsculas, números y guiones (3-40)"),
  name: z.string().min(1).max(120),
  ownerEmail: z.email(),
  ownerPassword: z.string().min(8, "mínimo 8 caracteres"),
});

admin.post("/tenants", async (c) => {
  const body = createTenantSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);

  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, body.data.slug));
  if (existing) return c.json({ error: "slug_taken" }, 409);

  const [tenant] = await db
    .insert(tenants)
    .values({ slug: body.data.slug, name: body.data.name })
    .returning();

  // Owner: crea el usuario vía Better-Auth (password scrypt) o reutiliza si ya existe.
  let [ownerUser] = await db.select().from(user).where(eq(user.email, body.data.ownerEmail));
  if (!ownerUser) {
    await auth.api.signUpEmail({
      body: {
        email: body.data.ownerEmail,
        password: body.data.ownerPassword,
        name: `Owner ${body.data.name}`,
      },
    });
    [ownerUser] = await db.select().from(user).where(eq(user.email, body.data.ownerEmail));
  }
  await db
    .insert(memberships)
    .values({ userId: ownerUser!.id, tenantId: tenant!.id, role: "owner" })
    .onConflictDoNothing();

  return c.json(
    { tenant: { id: tenant!.id, slug: tenant!.slug, name: tenant!.name }, ownerEmail: body.data.ownerEmail },
    201,
  );
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

// Asignar (o limpiar con null/"") el dominio propio de una inmobiliaria. Lo
// hace la plataforma (superadmin); el tenant-site lo resuelve por custom_domain.
const domainSchema = z.object({ domain: z.string().max(253).nullable() });
// hostname válido: etiquetas alfanuméricas separadas por puntos + TLD (sin
// protocolo, puerto ni ruta). Bloquea entradas tipo "http://x" o "x/y".
const HOSTNAME_RE = /^([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/;

admin.put("/tenants/:slug/domain", async (c) => {
  const body = domainSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: "invalid_body", detail: "se espera { domain: string | null }" }, 400);
  }
  const raw = (body.data.domain ?? "").trim().toLowerCase();
  const domain = raw === "" ? null : raw;
  if (domain && !HOSTNAME_RE.test(domain)) return c.json({ error: "invalid_domain" }, 400);

  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, c.req.param("slug")));
  if (!tenant) return c.json({ error: "tenant_not_found" }, 404);

  // Unicidad: el dominio no puede estar asignado a otra inmobiliaria.
  if (domain) {
    const other = await db.query.tenants.findFirst({ where: eq(tenants.customDomain, domain) });
    if (other && other.id !== tenant.id) return c.json({ error: "domain_taken" }, 409);
  }

  const [row] = await db
    .update(tenants)
    .set({ customDomain: domain })
    .where(eq(tenants.id, tenant.id))
    .returning();
  return c.json({ tenant: tenant.slug, customDomain: row!.customDomain });
});

// Edición del micrositio de un tenant POR EL SUPERADMIN (onboarding / gestión).
// El superadmin no es miembro del tenant, así que no puede usar /tenant/site
// (requiere membership); estas rutas van gateadas por requirePlatformAdmin.
admin.get("/tenants/:slug/site", async (c) => {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, c.req.param("slug")));
  if (!tenant) return c.json({ error: "tenant_not_found" }, 404);
  return c.json({ siteConfig: tenant.siteConfig });
});

admin.patch("/tenants/:slug/site", async (c) => {
  const body = siteConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, c.req.param("slug")));
  if (!tenant) return c.json({ error: "tenant_not_found" }, 404);

  const [row] = await db
    .update(tenants)
    .set({ siteConfig: body.data })
    .where(eq(tenants.id, tenant.id))
    .returning();
  return c.json({ siteConfig: row!.siteConfig });
});

admin.post("/tenants/:slug/media", async (c) => {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, c.req.param("slug")));
  if (!tenant) return c.json({ error: "tenant_not_found" }, 404);
  const body = await c.req.parseBody();
  const r = await saveSiteMedia(tenant.id, body["file"]);
  if (!r.ok) return c.json({ error: r.error }, 400);
  return c.json({ url: r.url, kind: r.kind }, 201);
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
