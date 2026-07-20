import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clients, closeDb, db, memberships, modules, subscriptions, tenants, user } from "@rep/db";
import type { Tenant } from "@rep/db";
import { invalidateModules } from "@rep/modules";
import { app } from "../app.js";
import { ensureModule } from "./helpers.js";

// Módulo Clientes: CRUD + aislamiento entre tenants + gating por módulo.

const EMAIL = "test-clients@example.com";
const PASSWORD = "super-secreta-123";
const SLUGS = ["test-cli-a", "test-cli-b"];

let tenantA: Tenant; // con módulo clients + membership del usuario
let tenantB: Tenant; // el usuario NO es miembro
let clientsModuleId: string;

async function cleanup() {
  await db.delete(user).where(eq(user.email, EMAIL));
  await db.delete(tenants).where(inArray(tenants.slug, SLUGS)); // cascade → clients, subs, memberships
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
  const mod = await ensureModule("clients");
  clientsModuleId = mod!.id;

  [tenantA] = (await db.insert(tenants).values({ slug: SLUGS[0]!, name: "A" }).returning()) as [Tenant];
  [tenantB] = (await db.insert(tenants).values({ slug: SLUGS[1]!, name: "B" }).returning()) as [Tenant];
  await db.insert(subscriptions).values([
    { tenantId: tenantA.id, moduleId: clientsModuleId, active: true },
    { tenantId: tenantB.id, moduleId: clientsModuleId, active: true },
  ]);

  cookie = await signUpCookie();
  const [u] = await db.select().from(user).where(eq(user.email, EMAIL));
  await db.insert(memberships).values({ userId: u!.id, tenantId: tenantA.id, role: "agent" });
});

afterAll(async () => {
  await cleanup(); // el módulo 'clients' del catálogo se deja (lo usa el seed)
  await closeDb();
});

// Sin barra final: Hono monta el sub-router en /tenant/clients (colección = "").
function req(path = "", init: RequestInit = {}) {
  return app.request(`/tenant/clients${path}`, {
    ...init,
    headers: { "x-tenant-slug": SLUGS[0]!, cookie, "content-type": "application/json", ...init.headers },
  });
}

describe("Clientes CRUD", () => {
  it("crea y lista un cliente del tenant", async () => {
    const create = await req("", {
      method: "POST",
      body: JSON.stringify({ name: "Ana Pérez", email: "ana@x.com", stage: "lead" }),
    });
    expect(create.status).toBe(201);
    const { client } = (await create.json()) as { client: { id: string; name: string } };
    expect(client.name).toBe("Ana Pérez");

    const list = await req("");
    const body = (await list.json()) as { clients: Array<{ id: string }> };
    expect(body.clients.map((c) => c.id)).toContain(client.id);
  });

  it("actualiza y borra", async () => {
    const { client } = (await (
      await req("", { method: "POST", body: JSON.stringify({ name: "Luis" }) })
    ).json()) as { client: { id: string } };

    const upd = await req(`/${client.id}`, { method: "PATCH", body: JSON.stringify({ stage: "active" }) });
    expect(((await upd.json()) as { client: { stage: string } }).client.stage).toBe("active");

    expect((await req(`/${client.id}`, { method: "DELETE" })).status).toBe(204);
    const list = (await (await req("")).json()) as { clients: unknown[] };
    expect(list.clients).toHaveLength(0);
  });

  it("body inválido → 400", async () => {
    const res = await req("", { method: "POST", body: JSON.stringify({ name: "" }) });
    expect(res.status).toBe(400);
  });
});

describe("Aislamiento y gating", () => {
  it("un cliente creado en A NO es visible desde B (aislamiento)", async () => {
    const { client } = (await (
      await req("", { method: "POST", body: JSON.stringify({ name: "Secreto A" }) })
    ).json()) as { client: { id: string } };

    // el usuario no es miembro de B → 403 (no puede ni listar)
    const asB = await app.request("/tenant/clients", {
      headers: { "x-tenant-slug": SLUGS[1]!, cookie },
    });
    expect(asB.status).toBe(403);

    // y a nivel de datos, el cliente pertenece solo a A
    const rowsB = await db.select().from(clients).where(eq(clients.tenantId, tenantB.id));
    expect(rowsB.find((r) => r.id === client.id)).toBeUndefined();
  });

  it("sin sesión → 401", async () => {
    const res = await app.request("/tenant/clients", { headers: { "x-tenant-slug": SLUGS[0]! } });
    expect(res.status).toBe(401);
  });

  it("tenant sin el módulo clients → 403 module_not_active", async () => {
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
