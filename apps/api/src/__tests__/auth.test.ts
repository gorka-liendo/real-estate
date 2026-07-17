import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db, memberships, tenants, user, type Tenant } from "@rep/db";
import { app } from "../app.js";

// Integración de auth (Better-Auth) + membership sobre la app real.

const EMAIL = "test-auth@example.com";
const PASSWORD = "super-secreta-123";
const SLUGS = ["test-auth-a", "test-auth-b"];

let tenantA: Tenant;
let tenantB: Tenant;

async function cleanup() {
  await db.delete(user).where(eq(user.email, EMAIL)); // cascade → sessions, accounts, memberships
  await db.delete(tenants).where(inArray(tenants.slug, SLUGS));
}

async function signUpAndGetCookie(): Promise<string> {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Test Auth" }),
  });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0]!;
}

beforeEach(async () => {
  await cleanup();
  [tenantA] = (await db
    .insert(tenants)
    .values({ slug: SLUGS[0]!, name: "Tenant Auth A" })
    .returning()) as [Tenant];
  [tenantB] = (await db
    .insert(tenants)
    .values({ slug: SLUGS[1]!, name: "Tenant Auth B" })
    .returning()) as [Tenant];
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("autenticación", () => {
  it("sign-up devuelve sesión en cookie httpOnly", async () => {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Test Auth" }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("better-auth.session_token");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("sign-in con credenciales válidas funciona; con password mala → 401", async () => {
    await signUpAndGetCookie();
    const ok = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    expect(ok.status).toBe(200);

    const bad = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: "incorrecta" }),
    });
    expect(bad.status).toBe(401);
  });

  it("el password se persiste hasheado, nunca en claro", async () => {
    await signUpAndGetCookie();
    const [u] = await db.select().from(user).where(eq(user.email, EMAIL));
    const account = await db.query.account.findFirst({
      where: (a, { eq: eqOp }) => eqOp(a.userId, u!.id),
    });
    expect(account?.password).toBeTruthy();
    expect(account!.password).not.toContain(PASSWORD);
  });

  it("/me sin sesión → 401", async () => {
    const res = await app.request("/me");
    expect(res.status).toBe(401);
  });

  it("/me con sesión devuelve usuario y sus memberships", async () => {
    const cookie = await signUpAndGetCookie();
    const [u] = await db.select().from(user).where(eq(user.email, EMAIL));
    await db
      .insert(memberships)
      .values({ userId: u!.id, tenantId: tenantA.id, role: "owner" });

    const res = await app.request("/me", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { email: string };
      memberships: Array<{ slug: string; role: string }>;
    };
    expect(body.user.email).toBe(EMAIL);
    expect(body.memberships).toEqual([
      { slug: SLUGS[0], name: "Tenant Auth A", role: "owner" },
    ]);
  });
});

describe("membership por tenant (rutas privadas del dashboard)", () => {
  it("sin sesión → 401 aunque el tenant exista", async () => {
    const res = await app.request("/tenant/team", {
      headers: { "x-tenant-slug": SLUGS[0]! },
    });
    expect(res.status).toBe(401);
  });

  it("con sesión pero sin membership en ese tenant → 403", async () => {
    const cookie = await signUpAndGetCookie();
    const [u] = await db.select().from(user).where(eq(user.email, EMAIL));
    await db
      .insert(memberships)
      .values({ userId: u!.id, tenantId: tenantA.id, role: "owner" });

    // es owner de A, pero pide datos de B
    const res = await app.request("/tenant/team", {
      headers: { "x-tenant-slug": SLUGS[1]!, cookie },
    });
    expect(res.status).toBe(403);
  });

  it("miembro del tenant → 200 con su rol y solo miembros de ese tenant", async () => {
    const cookie = await signUpAndGetCookie();
    const [u] = await db.select().from(user).where(eq(user.email, EMAIL));
    await db
      .insert(memberships)
      .values({ userId: u!.id, tenantId: tenantA.id, role: "agent" });

    const res = await app.request("/tenant/team", {
      headers: { "x-tenant-slug": SLUGS[0]!, cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      role: string;
      members: Array<{ tenantId: string }>;
    };
    expect(body.role).toBe("agent");
    expect(body.members.every((m) => m.tenantId === tenantA.id)).toBe(true);
  });
});
