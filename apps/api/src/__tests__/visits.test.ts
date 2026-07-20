import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  clients,
  closeDb,
  db,
  memberships,
  modules,
  properties,
  subscriptions,
  tenants,
  user,
  visits,
} from "@rep/db";
import type { Tenant } from "@rep/db";
import { invalidateModules } from "@rep/modules";
import { app } from "../app.js";
import { ensureModule } from "./helpers.js";
import { resetLeadThrottle } from "../modules/leads/leads.throttle.js";

// Agenda de visitas: solicitud pública (ficha) + gestión privada (dashboard)
// con detección de choques de franja. Gating, honeypot y aislamiento A/B.

const EMAIL = "test-visits@example.com";
const PASSWORD = "super-secreta-123";
const SLUGS = ["test-vis-a", "test-vis-b"];

let tenantA: Tenant;
let tenantB: Tenant;
let propA: string; // inmueble publicado de A
let cookie: string;

async function cleanup() {
  await db.delete(user).where(eq(user.email, EMAIL));
  await db.delete(tenants).where(inArray(tenants.slug, SLUGS)); // cascade
}

async function signUpCookie(): Promise<string> {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Test" }),
  });
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

beforeEach(async () => {
  await cleanup();
  resetLeadThrottle();
  const mod = await ensureModule("visits");

  [tenantA] = (await db.insert(tenants).values({ slug: SLUGS[0]!, name: "A" }).returning()) as [Tenant];
  [tenantB] = (await db.insert(tenants).values({ slug: SLUGS[1]!, name: "B" }).returning()) as [Tenant];
  await db.insert(subscriptions).values([
    { tenantId: tenantA.id, moduleId: mod!.id, active: true },
    { tenantId: tenantB.id, moduleId: mod!.id, active: true },
  ]);
  await invalidateModules(tenantA.id);
  await invalidateModules(tenantB.id);

  const [p] = await db
    .insert(properties)
    .values({ tenantId: tenantA.id, title: "Piso visitas", status: "published", operation: "sale" })
    .returning();
  propA = p!.id;

  cookie = await signUpCookie();
  const [u] = await db.select().from(user).where(eq(user.email, EMAIL));
  await db.insert(memberships).values({ userId: u!.id, tenantId: tenantA.id, role: "agent" });
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

const tomorrow = (h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

function requestVisit(slug: string, body: unknown) {
  return app.request("/tenant/visits/request", {
    method: "POST",
    headers: { "x-tenant-slug": slug, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function priv(path: string, init: RequestInit = {}) {
  return app.request(`/tenant/visits${path}`, {
    ...init,
    headers: { "x-tenant-slug": SLUGS[0]!, cookie, "content-type": "application/json", ...init.headers },
  });
}

describe("Solicitud pública de visita", () => {
  it("crea la visita 'requested' y el lead enlazado en el CRM", async () => {
    const res = await requestVisit(SLUGS[0]!, {
      propertyId: propA,
      name: "Visitante Uno",
      email: "visita@x.com",
      scheduledAt: tomorrow(11),
    });
    expect(res.status).toBe(201);

    const vs = await db.select().from(visits).where(eq(visits.tenantId, tenantA.id));
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({ status: "requested", propertyId: propA, name: "Visitante Uno" });

    const cs = await db.select().from(clients).where(eq(clients.tenantId, tenantA.id));
    expect(cs).toHaveLength(1);
    expect(cs[0]!.id).toBe(vs[0]!.clientId);
    expect(cs[0]).toMatchObject({ stage: "lead", interestPropertyId: propA });
  });

  it("reusa el cliente existente por email (no duplica)", async () => {
    await db.insert(clients).values({
      tenantId: tenantA.id,
      name: "Ya Existía",
      email: "repite@x.com",
      stage: "active",
    });
    const res = await requestVisit(SLUGS[0]!, {
      propertyId: propA,
      name: "Repite",
      email: "repite@x.com",
      scheduledAt: tomorrow(12),
    });
    expect(res.status).toBe(201);
    const cs = await db.select().from(clients).where(eq(clients.tenantId, tenantA.id));
    expect(cs).toHaveLength(1); // sigue habiendo uno
    const vs = await db.select().from(visits).where(eq(visits.tenantId, tenantA.id));
    expect(vs[0]!.clientId).toBe(cs[0]!.id);
  });

  it("inmueble de OTRO tenant → 404 y nada insertado (aislamiento)", async () => {
    const res = await requestVisit(SLUGS[1]!, {
      propertyId: propA, // propiedad de A pedida vía B
      name: "Cruzado",
      email: "cruz@x.com",
      scheduledAt: tomorrow(10),
    });
    expect(res.status).toBe(404);
    const vs = await db.select().from(visits).where(eq(visits.tenantId, tenantB.id));
    expect(vs).toHaveLength(0);
  });

  it("fecha pasada → 400; honeypot → 204 sin insertar; sin módulo → 403", async () => {
    const past = await requestVisit(SLUGS[0]!, {
      propertyId: propA,
      name: "Tarde",
      email: "t@x.com",
      scheduledAt: new Date(Date.now() - 3600_000).toISOString(),
    });
    expect(past.status).toBe(400);

    const bot = await requestVisit(SLUGS[0]!, {
      propertyId: propA,
      name: "Bot",
      email: "b@x.com",
      scheduledAt: tomorrow(9),
      company: "spam",
    });
    expect(bot.status).toBe(204);
    expect(await db.select().from(visits).where(eq(visits.tenantId, tenantA.id))).toHaveLength(0);

    await db.update(subscriptions).set({ active: false }).where(eq(subscriptions.tenantId, tenantA.id));
    await invalidateModules(tenantA.id);
    const gated = await requestVisit(SLUGS[0]!, {
      propertyId: propA,
      name: "X",
      email: "x@x.com",
      scheduledAt: tomorrow(9),
    });
    expect(gated.status).toBe(403);
  });
});

describe("Agenda privada", () => {
  it("GET sin sesión → 401; con sesión lista las visitas del tenant", async () => {
    await requestVisit(SLUGS[0]!, {
      propertyId: propA,
      name: "V",
      email: "v@x.com",
      scheduledAt: tomorrow(16),
    });
    const anon = await app.request("/tenant/visits", { headers: { "x-tenant-slug": SLUGS[0]! } });
    expect(anon.status).toBe(401);

    const res = await priv("");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { visits: Array<{ name: string }> };
    expect(body.visits).toHaveLength(1);
    expect(body.visits[0]!.name).toBe("V");
  });

  it("confirmar → 200; confirmar OTRA en la misma franja → 409 slot_conflict", async () => {
    await requestVisit(SLUGS[0]!, { propertyId: propA, name: "V1", email: "v1@x.com", scheduledAt: tomorrow(17, 0) });
    await requestVisit(SLUGS[0]!, { propertyId: propA, name: "V2", email: "v2@x.com", scheduledAt: tomorrow(17, 15) });
    const [v1, v2] = await db.select().from(visits).where(eq(visits.tenantId, tenantA.id));

    const ok = await priv(`/${v1!.id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) });
    expect(ok.status).toBe(200);

    // 17:15 está dentro de la franja de 30 min de la de las 17:00 → choque.
    const clash = await priv(`/${v2!.id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) });
    expect(clash.status).toBe(409);
    expect((await clash.json()) as unknown).toMatchObject({ error: "slot_conflict" });

    // Reprogramada a una franja libre, sí se confirma.
    const moved = await priv(`/${v2!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed", scheduledAt: tomorrow(18, 0) }),
    });
    expect(moved.status).toBe(200);
  });

  it("una visita inexistente o de otro tenant → 404", async () => {
    const res = await priv(`/${randomUUID()}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
    expect(res.status).toBe(404);
  });
});
