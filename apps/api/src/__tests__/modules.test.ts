import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db, modules, subscriptions, tenants, type Tenant } from "@rep/db";
import { getActiveModules, hasModule, invalidateModules } from "@rep/modules";
import { app } from "../app.js";
import { ensureModule } from "./helpers.js";

// Feature flags por tenant: hasModule + caché + requireModule en la API.

const SLUGS = ["test-mod-a", "test-mod-b"];
const TEST_CODE = "test_mod_flag";

let tenantA: Tenant; // con módulos
let tenantB: Tenant; // sin módulos
let testModuleId: string;
let micrositeModuleId: string;

async function cleanup() {
  await db.delete(tenants).where(inArray(tenants.slug, SLUGS)); // cascade → subscriptions
  await db.delete(modules).where(eq(modules.code, TEST_CODE));
}

beforeEach(async () => {
  await cleanup();

  const [testMod] = await db
    .insert(modules)
    .values({ code: TEST_CODE, name: "Test Flag", priceMonthly: 0 })
    .returning();
  testModuleId = testMod!.id;

  // el módulo 'microsite' (gatea /tenant/microsite) se garantiza sin machacar
  // el nombre del catálogo (ver helpers.ensureModule)
  const micrositeMod = await ensureModule("microsite");
  micrositeModuleId = micrositeMod.id;

  [tenantA] = (await db
    .insert(tenants)
    .values({ slug: SLUGS[0]!, name: "Mod A" })
    .returning()) as [Tenant];
  [tenantB] = (await db
    .insert(tenants)
    .values({ slug: SLUGS[1]!, name: "Mod B" })
    .returning()) as [Tenant];

  await db.insert(subscriptions).values([
    { tenantId: tenantA.id, moduleId: testModuleId, active: true },
    { tenantId: tenantA.id, moduleId: micrositeModuleId, active: true },
  ]);
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("hasModule / getActiveModules", () => {
  it("true para módulo contratado y activo", async () => {
    expect(await hasModule(tenantA.id, TEST_CODE)).toBe(true);
  });

  it("false sin subscripción", async () => {
    expect(await hasModule(tenantB.id, TEST_CODE)).toBe(false);
  });

  it("false con subscripción inactiva", async () => {
    await db.insert(subscriptions).values({
      tenantId: tenantB.id,
      moduleId: testModuleId,
      active: false,
    });
    expect(await hasModule(tenantB.id, TEST_CODE)).toBe(false);
  });

  it("getActiveModules devuelve todos los códigos activos", async () => {
    const codes = await getActiveModules(tenantA.id);
    expect(codes.sort()).toEqual(["microsite", TEST_CODE].sort());
  });

  it("la caché sirve el valor viejo hasta invalidar", async () => {
    expect(await hasModule(tenantA.id, TEST_CODE)).toBe(true); // llena caché

    await db
      .update(subscriptions)
      .set({ active: false })
      .where(eq(subscriptions.tenantId, tenantA.id));

    // dentro del TTL sigue el valor cacheado…
    expect(await hasModule(tenantA.id, TEST_CODE)).toBe(true);
    // …y tras invalidar (lo que harán los webhooks de Stripe) refleja el cambio
    await invalidateModules(tenantA.id);
    expect(await hasModule(tenantA.id, TEST_CODE)).toBe(false);
  });
});

describe("API", () => {
  it("GET /tenant/modules lista los códigos activos", async () => {
    const res = await app.request("/tenant/modules", {
      headers: { "x-tenant-slug": SLUGS[0]! },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { modules: string[] };
    expect(body.modules.sort()).toEqual(["microsite", TEST_CODE].sort());
  });

  it("ruta gateada → 200 con el módulo activo", async () => {
    const res = await app.request("/tenant/microsite", {
      headers: { "x-tenant-slug": SLUGS[0]! },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe(SLUGS[0]);
  });

  it("ruta gateada → 403 module_not_active sin el módulo", async () => {
    const res = await app.request("/tenant/microsite", {
      headers: { "x-tenant-slug": SLUGS[1]! },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; module: string };
    expect(body).toEqual({ error: "module_not_active", module: "microsite" });
  });
});
