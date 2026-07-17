import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db, modules, platformAdmins, tenants, user, type Tenant } from "@rep/db";
import { app } from "../app.js";

// Panel de superadmin: gestión de módulos por tenant (reemplaza a Stripe).

const ADMIN_EMAIL = "test-admin@example.com";
const PLAIN_EMAIL = "test-plain@example.com";
const PASSWORD = "super-secreta-123";
const SLUG = "test-admin-tenant";
const TEST_CODE = "test_admin_module";

let tenant: Tenant;

async function cleanup() {
  await db.delete(user).where(inArray(user.email, [ADMIN_EMAIL, PLAIN_EMAIL]));
  await db.delete(tenants).where(eq(tenants.slug, SLUG));
  await db.delete(modules).where(eq(modules.code, TEST_CODE));
}

async function signUp(email: string): Promise<string> {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, name: email }),
  });
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

let adminCookie: string;
let plainCookie: string;

beforeEach(async () => {
  await cleanup();
  await db.insert(modules).values({ code: TEST_CODE, name: "Admin Test", priceMonthly: 1000 });
  [tenant] = (await db
    .insert(tenants)
    .values({ slug: SLUG, name: "Admin Tenant" })
    .returning()) as [Tenant];

  adminCookie = await signUp(ADMIN_EMAIL);
  const [adminU] = await db.select().from(user).where(eq(user.email, ADMIN_EMAIL));
  await db.insert(platformAdmins).values({ userId: adminU!.id });

  plainCookie = await signUp(PLAIN_EMAIL); // usuario normal, NO superadmin
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("acceso al panel", () => {
  it("sin sesión → 401", async () => {
    const res = await app.request("/admin/tenants");
    expect(res.status).toBe(401);
  });

  it("usuario normal (no superadmin) → 403", async () => {
    const res = await app.request("/admin/tenants", { headers: { cookie: plainCookie } });
    expect(res.status).toBe(403);
  });

  it("superadmin → 200", async () => {
    const res = await app.request("/admin/tenants", { headers: { cookie: adminCookie } });
    expect(res.status).toBe(200);
  });
});

describe("gestión de módulos", () => {
  it("activa un módulo y queda reflejado en activeModules", async () => {
    const res = await app.request(`/admin/tenants/${SLUG}/modules/${TEST_CODE}`, {
      method: "PUT",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { active: boolean; activeModules: string[] };
    expect(body.active).toBe(true);
    expect(body.activeModules).toContain(TEST_CODE);
  });

  it("desactivar lo quita de activeModules (e invalida caché)", async () => {
    await app.request(`/admin/tenants/${SLUG}/modules/${TEST_CODE}`, {
      method: "PUT",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    const res = await app.request(`/admin/tenants/${SLUG}/modules/${TEST_CODE}`, {
      method: "PUT",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    const body = (await res.json()) as { activeModules: string[] };
    expect(body.activeModules).not.toContain(TEST_CODE);
  });

  it("módulo inexistente → 404 module_not_found", async () => {
    const res = await app.request(`/admin/tenants/${SLUG}/modules/no_existe`, {
      method: "PUT",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()) as unknown).toMatchObject({ error: "module_not_found" });
  });

  it("tenant inexistente → 404 tenant_not_found", async () => {
    const res = await app.request(`/admin/tenants/no-existe/modules/${TEST_CODE}`, {
      method: "PUT",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    expect(res.status).toBe(404);
  });

  it("body inválido → 400", async () => {
    const res = await app.request(`/admin/tenants/${SLUG}/modules/${TEST_CODE}`, {
      method: "PUT",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ nope: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it("usuario normal no puede togglear módulos → 403", async () => {
    const res = await app.request(`/admin/tenants/${SLUG}/modules/${TEST_CODE}`, {
      method: "PUT",
      headers: { cookie: plainCookie, "content-type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    expect(res.status).toBe(403);
  });
});
