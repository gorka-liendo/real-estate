import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { properties, closeDb, db, memberships, modules, subscriptions, tenants, user } from "@rep/db";
import type { Tenant } from "@rep/db";
import { invalidateModules } from "@rep/modules";
import { app } from "../app.js";

// Módulo Propiedades: CRUD + aislamiento entre tenants + gating por módulo.

const EMAIL = "test-properties@example.com";
const PASSWORD = "super-secreta-123";
const SLUGS = ["test-prop-a", "test-prop-b"];

let tenantA: Tenant; // con módulo properties + membership del usuario
let tenantB: Tenant; // el usuario NO es miembro
let propertiesModuleId: string;

async function cleanup() {
  await db.delete(user).where(eq(user.email, EMAIL));
  await db.delete(tenants).where(inArray(tenants.slug, SLUGS)); // cascade → properties, subs, memberships
}

async function signUpCookie(): Promise<string> {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Test" }),
  });
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

let cookie: string;

beforeEach(async () => {
  await cleanup();
  const [mod] = await db
    .insert(modules)
    .values({ code: "properties", name: "Propiedades", priceMonthly: 0 })
    .onConflictDoUpdate({ target: modules.code, set: { name: "Propiedades" } })
    .returning();
  propertiesModuleId = mod!.id;

  [tenantA] = (await db.insert(tenants).values({ slug: SLUGS[0]!, name: "A" }).returning()) as [Tenant];
  [tenantB] = (await db.insert(tenants).values({ slug: SLUGS[1]!, name: "B" }).returning()) as [Tenant];
  await db.insert(subscriptions).values([
    { tenantId: tenantA.id, moduleId: propertiesModuleId, active: true },
    { tenantId: tenantB.id, moduleId: propertiesModuleId, active: true },
  ]);

  cookie = await signUpCookie();
  const [u] = await db.select().from(user).where(eq(user.email, EMAIL));
  await db.insert(memberships).values({ userId: u!.id, tenantId: tenantA.id, role: "agent" });
});

afterAll(async () => {
  await cleanup(); // el módulo 'properties' del catálogo se deja (lo usa el seed)
  await closeDb();
});

// Sin barra final: Hono monta el sub-router en /tenant/properties (colección = "").
function req(path = "", init: RequestInit = {}) {
  return app.request(`/tenant/properties${path}`, {
    ...init,
    headers: { "x-tenant-slug": SLUGS[0]!, cookie, "content-type": "application/json", ...init.headers },
  });
}

describe("Propiedades CRUD", () => {
  it("crea y lista una propiedad del tenant", async () => {
    const create = await req("", {
      method: "POST",
      body: JSON.stringify({ title: "Piso céntrico", kind: "flat", operation: "sale", price: 250000 }),
    });
    expect(create.status).toBe(201);
    const { property } = (await create.json()) as { property: { id: string; title: string; price: number } };
    expect(property.title).toBe("Piso céntrico");
    expect(property.price).toBe(250000);

    const list = await req("");
    const body = (await list.json()) as { properties: Array<{ id: string }> };
    expect(body.properties.map((p) => p.id)).toContain(property.id);
  });

  it("actualiza y borra", async () => {
    const { property } = (await (
      await req("", { method: "POST", body: JSON.stringify({ title: "Casa" }) })
    ).json()) as { property: { id: string } };

    const upd = await req(`/${property.id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) });
    expect(((await upd.json()) as { property: { status: string } }).property.status).toBe("published");

    expect((await req(`/${property.id}`, { method: "DELETE" })).status).toBe(204);
    const list = (await (await req("")).json()) as { properties: unknown[] };
    expect(list.properties).toHaveLength(0);
  });

  it("body inválido → 400", async () => {
    const res = await req("", { method: "POST", body: JSON.stringify({ title: "" }) });
    expect(res.status).toBe(400);
  });
});

describe("Aislamiento y gating", () => {
  it("una propiedad creada en A NO es visible desde B (aislamiento)", async () => {
    const { property } = (await (
      await req("", { method: "POST", body: JSON.stringify({ title: "Secreto A" }) })
    ).json()) as { property: { id: string } };

    // el usuario no es miembro de B → 403 (no puede ni listar)
    const asB = await app.request("/tenant/properties", {
      headers: { "x-tenant-slug": SLUGS[1]!, cookie },
    });
    expect(asB.status).toBe(403);

    // y a nivel de datos, la propiedad pertenece solo a A
    const rowsB = await db.select().from(properties).where(eq(properties.tenantId, tenantB.id));
    expect(rowsB.find((r) => r.id === property.id)).toBeUndefined();
  });

  it("sin sesión → 401", async () => {
    const res = await app.request("/tenant/properties", { headers: { "x-tenant-slug": SLUGS[0]! } });
    expect(res.status).toBe(401);
  });

  it("tenant sin el módulo properties → 403 module_not_active", async () => {
    await db
      .update(subscriptions)
      .set({ active: false })
      .where(eq(subscriptions.tenantId, tenantA.id));
    await invalidateModules(tenantA.id); // como harán los toggles del panel admin
    const res = await req("");
    expect(res.status).toBe(403);
    expect((await res.json()) as unknown).toMatchObject({ error: "module_not_active" });
  });
});
