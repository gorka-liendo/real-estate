import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, forTenant, modules, subscriptions } from "@rep/db";
import { MemoryFlagCache, type FlagCache } from "./cache.js";

export type { FlagCache } from "./cache.js";
export { MemoryFlagCache } from "./cache.js";

/** Códigos conocidos con autocomplete; admite strings nuevos sin tocar el tipo. */
export type ModuleCode =
  | "microsite"
  | "ai_descriptions"
  | "whatsapp_bot"
  | (string & {});

const ttl = z.coerce
  .number()
  .int()
  .positive()
  .default(60_000)
  .parse(process.env.MODULE_CACHE_TTL_MS);

let cache: FlagCache = new MemoryFlagCache(ttl);

/** Sustituye la caché (Redis en Fase E). */
export function setFlagCache(next: FlagCache) {
  cache = next;
}

/** Códigos de módulo activos del tenant (con caché, TTL corto). */
export async function getActiveModules(tenantId: string): Promise<string[]> {
  const hit = await cache.get(tenantId);
  if (hit) return hit;

  // subscriptions es tenant-scoped → siempre vía forTenant; modules (catálogo) no lo es
  const subs = await forTenant(tenantId).select(
    subscriptions,
    eq(subscriptions.active, true),
  );
  let codes: string[] = [];
  if (subs.length > 0) {
    const rows = await db
      .select({ code: modules.code })
      .from(modules)
      .where(inArray(modules.id, subs.map((s) => s.moduleId)));
    codes = rows.map((r) => r.code);
  }

  await cache.set(tenantId, codes);
  return codes;
}

export async function hasModule(tenantId: string, code: ModuleCode): Promise<boolean> {
  return (await getActiveModules(tenantId)).includes(code);
}

/** Invalidar tras cambios de subscripción (webhooks de Stripe en Fase C). */
export async function invalidateModules(tenantId: string) {
  await cache.delete(tenantId);
}
