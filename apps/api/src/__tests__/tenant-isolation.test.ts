import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeDb,
  db,
  forTenant,
  modules,
  subscriptions,
  TenantContextMissingError,
  tenantDb,
  tenants,
  withTenant,
  type Tenant,
} from "@rep/db";
import { app } from "../app.js";

// Test de aislamiento multi-tenant — INNEGOCIABLE: debe pasar siempre.
// Los fixtures se crean con `db` directo (tenants/modules no son tenant-scoped);
// el código de producto jamás accede así a tablas tenant-scoped.

const SLUGS = ["test-iso-a", "test-iso-b"];
const MODULE_CODE = "test_iso_module";

let tenantA: Tenant;
let tenantB: Tenant;
let subAId: string;
let subBId: string;

async function cleanup() {
  await db.delete(tenants).where(inArray(tenants.slug, SLUGS)); // cascade → subscriptions
  await db.delete(modules).where(eq(modules.code, MODULE_CODE));
}

beforeEach(async () => {
  await cleanup();
  const [mod] = await db
    .insert(modules)
    .values({ code: MODULE_CODE, name: "Test", priceMonthly: 0 })
    .returning();
  [tenantA] = (await db
    .insert(tenants)
    .values({ slug: "test-iso-a", name: "Tenant A" })
    .returning()) as [Tenant];
  [tenantB] = (await db
    .insert(tenants)
    .values({ slug: "test-iso-b", name: "Tenant B" })
    .returning()) as [Tenant];

  const [subA] = await db
    .insert(subscriptions)
    .values({ tenantId: tenantA.id, moduleId: mod!.id, active: true })
    .returning();
  const [subB] = await db
    .insert(subscriptions)
    .values({ tenantId: tenantB.id, moduleId: mod!.id, active: true })
    .returning();
  subAId = subA!.id;
  subBId = subB!.id;
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("aislamiento a nivel de @rep/db", () => {
  it("forTenant(A) solo devuelve filas de A", async () => {
    const rows = await forTenant(tenantA.id).select(subscriptions);
    expect(rows.map((r) => r.id)).toEqual([subAId]);
  });

  it("A no puede leer una fila de B ni forzando su id", async () => {
    const rows = await forTenant(tenantA.id).select(
      subscriptions,
      eq(subscriptions.id, subBId),
    );
    expect(rows).toEqual([]);
  });

  it("A no puede modificar filas de B ni forzando su id", async () => {
    await forTenant(tenantA.id).update(
      subscriptions,
      { active: false },
      eq(subscriptions.id, subBId),
    );
    const [subB] = await forTenant(tenantB.id).select(
      subscriptions,
      eq(subscriptions.id, subBId),
    );
    expect(subB?.active).toBe(true); // intacta
  });

  it("A no puede borrar filas de B ni forzando su id", async () => {
    await forTenant(tenantA.id).delete(subscriptions, eq(subscriptions.id, subBId));
    const rows = await forTenant(tenantB.id).select(subscriptions);
    expect(rows.map((r) => r.id)).toEqual([subBId]);
  });

  it("insert scoped fuerza el tenant del scope, no admite otro", async () => {
    // el tipo ya prohíbe pasar tenantId; verificamos el valor persistido
    const modRow = await db.query.modules.findFirst({ where: eq(modules.code, MODULE_CODE) });
    await forTenant(tenantA.id).delete(subscriptions); // limpia la de A
    await forTenant(tenantA.id).insert(subscriptions, { moduleId: modRow!.id, active: true });
    const rows = await forTenant(tenantA.id).select(subscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenantId).toBe(tenantA.id);
  });

  it("tenantDb() fuera de contexto lanza TenantContextMissingError", () => {
    expect(() => tenantDb()).toThrow(TenantContextMissingError);
  });

  it("withTenant() establece el contexto para tenantDb()", async () => {
    const rows = await withTenant(tenantA.id, () => tenantDb().select(subscriptions));
    expect(rows.map((r) => r.id)).toEqual([subAId]);
  });
});

describe("aislamiento a nivel de API (middleware)", () => {
  it("resuelve el tenant por header x-tenant-slug y solo devuelve sus datos", async () => {
    const res = await app.request("/tenant", {
      headers: { "x-tenant-slug": "test-iso-a" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe("test-iso-a");
  });

  it("resuelve el tenant por subdominio del Host", async () => {
    const res = await app.request("http://test-iso-b.localhost/tenant");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe("test-iso-b");
  });

  it("tenant desconocido → 404", async () => {
    const res = await app.request("/tenant", {
      headers: { "x-tenant-slug": "no-existe" },
    });
    expect(res.status).toBe(404);
  });

  it("sin tenant resoluble → 404", async () => {
    const res = await app.request("http://localhost/tenant");
    expect(res.status).toBe(404);
  });

  it("GET /tenant expone el brand_config (para el white-label)", async () => {
    const res = await app.request("/tenant", { headers: { "x-tenant-slug": "test-iso-a" } });
    const body = (await res.json()) as { slug: string; brandConfig: unknown };
    expect(body.slug).toBe("test-iso-a");
    expect(body).toHaveProperty("brandConfig");
  });
});
