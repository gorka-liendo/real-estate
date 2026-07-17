import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db, tenants, withTenant, type Tenant } from "@rep/db";

export type TenantEnv = { Variables: { tenant: Tenant } };

/**
 * Resuelve el tenant de la petición y lo deja en contexto (AsyncLocalStorage)
 * para que tenantDb() funcione en cualquier punto del request.
 *
 * Orden de resolución:
 *   1. Header `x-tenant-slug` (dev / clientes API)
 *   2. Subdominio del Host: martinez.plataforma.app → "martinez"
 *   3. (Fase D) custom_domain — lookup por dominio completo
 *   4. (Paso 5) sesión de Better-Auth en el dashboard
 */
function resolveSlug(headerSlug: string | undefined, host: string): string | null {
  if (headerSlug) return headerSlug;
  const hostname = host.split(":")[0]!;
  const [first, ...rest] = hostname.split(".");
  if (!first || rest.length === 0) return null; // "localhost" sin subdominio
  if (first === "www") return null;
  return first;
}

export const tenantMiddleware = createMiddleware<TenantEnv>(async (c, next) => {
  const host = c.req.header("host") ?? new URL(c.req.url).host;
  const slug = resolveSlug(c.req.header("x-tenant-slug"), host);
  if (!slug) return c.json({ error: "tenant_not_resolved" }, 404);

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
  if (!tenant) return c.json({ error: "tenant_not_found" }, 404);
  if (tenant.status !== "active") return c.json({ error: "tenant_suspended" }, 403);

  c.set("tenant", tenant);
  return withTenant(tenant.id, () => next());
});
