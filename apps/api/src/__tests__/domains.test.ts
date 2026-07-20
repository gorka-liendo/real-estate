import { inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db, platformAdmins, tenants, user } from "@rep/db";
import { app } from "../app.js";

// Dominios propios: endpoint público de resolución (custom_domain → slug) que
// consume el proxy del tenant-site, y el endpoint de superadmin para asignarlos.

const ADMIN_EMAIL = "test-domains-admin@example.com";
const PLAIN_EMAIL = "test-domains-plain@example.com";
const PASSWORD = "super-secreta-123";
const SLUG_A = "test-domains-a";
const SLUG_B = "test-domains-b";
const DOMAIN = "www.test-dominios.es";

async function cleanup() {
  await db.delete(user).where(inArray(user.email, [ADMIN_EMAIL, PLAIN_EMAIL]));
  await db.delete(tenants).where(inArray(tenants.slug, [SLUG_A, SLUG_B]));
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

function setDomain(slug: string, domain: string | null, cookie: string) {
  return app.request(`/admin/tenants/${slug}/domain`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ domain }),
  });
}

beforeEach(async () => {
  await cleanup();
  await db.insert(tenants).values([
    { slug: SLUG_A, name: "Dominios A" },
    { slug: SLUG_B, name: "Dominios B" },
  ]);
  adminCookie = await signUp(ADMIN_EMAIL);
  const [adminU] = await db.select().from(user).where(inArray(user.email, [ADMIN_EMAIL]));
  await db.insert(platformAdmins).values({ userId: adminU!.id });
  plainCookie = await signUp(PLAIN_EMAIL);
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("asignación de dominio (superadmin)", () => {
  it("usuario normal → 403", async () => {
    expect((await setDomain(SLUG_A, DOMAIN, plainCookie)).status).toBe(403);
  });

  it("asigna, normaliza a minúsculas y persiste", async () => {
    const res = await setDomain(SLUG_A, "  WWW.Test-Dominios.ES ", adminCookie);
    expect(res.status).toBe(200);
    expect((await res.json()) as { customDomain: string }).toMatchObject({ customDomain: DOMAIN });
  });

  it("dominio inválido → 400", async () => {
    expect((await setDomain(SLUG_A, "http://x/y", adminCookie)).status).toBe(400);
    expect((await setDomain(SLUG_A, "sin-tld", adminCookie)).status).toBe(400);
  });

  it("dominio ya asignado a otro tenant → 409", async () => {
    expect((await setDomain(SLUG_A, DOMAIN, adminCookie)).status).toBe(200);
    expect((await setDomain(SLUG_B, DOMAIN, adminCookie)).status).toBe(409);
  });

  it("reasignar el mismo dominio al MISMO tenant no es conflicto", async () => {
    expect((await setDomain(SLUG_A, DOMAIN, adminCookie)).status).toBe(200);
    expect((await setDomain(SLUG_A, DOMAIN, adminCookie)).status).toBe(200);
  });
});

describe("resolución pública (custom_domain → slug)", () => {
  it("dominio asignado → slug", async () => {
    await setDomain(SLUG_A, DOMAIN, adminCookie);
    const res = await app.request(`/public/resolve-domain?host=${DOMAIN}`);
    expect(res.status).toBe(200);
    expect((await res.json()) as { slug: string }).toEqual({ slug: SLUG_A });
  });

  it("ignora el puerto del host", async () => {
    await setDomain(SLUG_A, DOMAIN, adminCookie);
    const res = await app.request(`/public/resolve-domain?host=${DOMAIN}:443`);
    expect(res.status).toBe(200);
  });

  it("dominio no registrado → 404", async () => {
    expect((await app.request("/public/resolve-domain?host=nope.example.com")).status).toBe(404);
  });

  it("al limpiar el dominio deja de resolver", async () => {
    await setDomain(SLUG_A, DOMAIN, adminCookie);
    await setDomain(SLUG_A, null, adminCookie);
    expect((await app.request(`/public/resolve-domain?host=${DOMAIN}`)).status).toBe(404);
  });
});
