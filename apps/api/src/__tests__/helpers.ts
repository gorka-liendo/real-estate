import { eq } from "drizzle-orm";
import { db, modules } from "@rep/db";

/**
 * Asegura que un módulo del catálogo existe SIN machacar su nombre/precio:
 * los tests corren contra la misma BBDD que el dev y el viejo patrón
 * (`onConflictDoUpdate set { name: code }`) dejaba el catálogo del panel de
 * admin lleno de códigos crudos ("clients" en vez de "Clientes (CRM)").
 */
export async function ensureModule(code: string) {
  const existing = await db.query.modules.findFirst({ where: eq(modules.code, code) });
  if (existing) return existing;
  const [created] = await db
    .insert(modules)
    .values({ code, name: code, priceMonthly: 0 })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.query.modules.findFirst({ where: eq(modules.code, code) }))!;
}
