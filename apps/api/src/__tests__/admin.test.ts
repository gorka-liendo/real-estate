import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db, modules, platformAdmins, tenants, user, type Tenant } from "@rep/db";
import { app } from "../app.js";

// Panel de superadmin: gestión de módulos por tenant (reemplaza a Stripe).

const ADMIN_EMAIL = "test-admin@example.com";
const PLAIN_EMAIL = "test-plain@example.com";
const NEW_OWNER_EMAIL = "test-new-owner@example.com";
const PASSWORD = "super-secreta-123";
const SLUG = "test-admin-tenant";
const NEW_SLUG = "test-alta-inmo";
const TEST_CODE = "test_admin_module";

let tenant: Tenant;

async function cleanup() {
  await db.delete(user).where(inArray(user.email, [ADMIN_EMAIL, PLAIN_EMAIL, NEW_OWNER_EMAIL]));
  await db.delete(tenants).where(inArray(tenants.slug, [SLUG, NEW_SLUG]));
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

  it("superadmin → 200 con stats por tenant", async () => {
    const res = await app.request("/admin/tenants", { headers: { cookie: adminCookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tenants: Array<{ slug: string; stats: { properties: number; clients: number } }>;
    };
    const t = body.tenants.find((x) => x.slug === SLUG);
    expect(t!.stats).toMatchObject({ properties: 0, clients: 0 });
  });
});

describe("alta de inmobiliaria", () => {
  const payload = {
    slug: NEW_SLUG,
    name: "Alta Inmo Test",
    ownerEmail: NEW_OWNER_EMAIL,
    ownerPassword: "clave-segura-123",
  };

  it("crea tenant + owner y el owner puede iniciar sesión con membership", async () => {
    const res = await app.request("/admin/tenants", {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(201);

    // el owner recién creado puede entrar…
    const login = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: NEW_OWNER_EMAIL, password: payload.ownerPassword }),
    });
    expect(login.status).toBe(200);
    const ownerCookie = login.headers.get("set-cookie")!.split(";")[0]!;

    // …y /me muestra su membership de owner en el tenant nuevo
    const me = await app.request("/me", { headers: { cookie: ownerCookie } });
    const meBody = (await me.json()) as { memberships: Array<{ slug: string; role: string }> };
    expect(meBody.memberships).toContainEqual({ slug: NEW_SLUG, name: "Alta Inmo Test", role: "owner" });
  });

  it("slug duplicado → 409; slug inválido → 400; no superadmin → 403", async () => {
    await app.request("/admin/tenants", {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const dup = await app.request("/admin/tenants", {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(dup.status).toBe(409);

    const bad = await app.request("/admin/tenants", {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ ...payload, slug: "Mal Slug!" }),
    });
    expect(bad.status).toBe(400);

    const forbidden = await app.request("/admin/tenants", {
      method: "POST",
      headers: { cookie: plainCookie, "content-type": "application/json" },
      body: JSON.stringify({ ...payload, slug: "otro-slug-x" }),
    });
    expect(forbidden.status).toBe(403);
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

describe("edición del micrositio por el superadmin", () => {
  function patchSite(cookie: string, body: unknown) {
    return app.request(`/admin/tenants/${SLUG}/site`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("usuario normal (no superadmin) → 403", async () => {
    expect((await patchSite(plainCookie, { heroTitle: "X" })).status).toBe(403);
  });

  it("tenant inexistente → 404", async () => {
    const res = await app.request("/admin/tenants/no-existe/site", {
      method: "PATCH",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ heroTitle: "X" }),
    });
    expect(res.status).toBe(404);
  });

  it("el superadmin edita el site_config de cualquier tenant y persiste", async () => {
    const res = await patchSite(adminCookie, {
      headerStyle: "solid",
      logoScale: 1.5,
      about: "Editado por el superadmin",
    });
    expect(res.status).toBe(200);

    const get = await app.request(`/admin/tenants/${SLUG}/site`, {
      headers: { cookie: adminCookie },
    });
    expect(get.status).toBe(200);
    const body = (await get.json()) as { siteConfig: Record<string, unknown> };
    expect(body.siteConfig).toMatchObject({
      headerStyle: "solid",
      logoScale: 1.5,
      about: "Editado por el superadmin",
    });
  });

  it("body inválido → 400", async () => {
    expect((await patchSite(adminCookie, { headerStyle: "nope" })).status).toBe(400);
  });
});
