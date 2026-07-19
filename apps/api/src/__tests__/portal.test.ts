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

// Portal del propietario: token capability + datos de rendimiento del inmueble.
// Generación privada, lectura pública por token, aislamiento entre tenants.

const EMAIL = "test-portal@example.com";
const PASSWORD = "super-secreta-123";
const SLUGS = ["test-por-a", "test-por-b"];

let tenantA: Tenant;
let tenantB: Tenant;
let ownerId: string; // cliente propietario en A
let propId: string; // inmueble de A propiedad de ownerId
let cookie: string;

async function cleanup() {
  await db.delete(user).where(eq(user.email, EMAIL));
  await db.delete(tenants).where(inArray(tenants.slug, SLUGS));
}

beforeEach(async () => {
  await cleanup();
  const seeded = [];
  for (const code of ["owner_portal", "properties", "clients"]) {
    const [m] = await db
      .insert(modules)
      .values({ code, name: code, priceMonthly: 0 })
      .onConflictDoUpdate({ target: modules.code, set: { name: code } })
      .returning();
    seeded.push(m!);
  }

  [tenantA] = (await db.insert(tenants).values({ slug: SLUGS[0]!, name: "A" }).returning()) as [Tenant];
  [tenantB] = (await db.insert(tenants).values({ slug: SLUGS[1]!, name: "B" }).returning()) as [Tenant];
  await db.insert(subscriptions).values(
    seeded.flatMap((m) => [
      { tenantId: tenantA.id, moduleId: m.id, active: true },
      { tenantId: tenantB.id, moduleId: m.id, active: true },
    ]),
  );
  await invalidateModules(tenantA.id);
  await invalidateModules(tenantB.id);

  const [owner] = await db
    .insert(clients)
    .values({ tenantId: tenantA.id, name: "Propietario A", email: "prop-a@x.com", stage: "active" })
    .returning();
  ownerId = owner!.id;

  const [p] = await db
    .insert(properties)
    .values({
      tenantId: tenantA.id,
      title: "Piso del portal",
      status: "published",
      operation: "sale",
      price: 250_000,
      ownerClientId: ownerId,
    })
    .returning();
  propId = p!.id;

  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Test" }),
  });
  cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const [u] = await db.select().from(user).where(eq(user.email, EMAIL));
  await db.insert(memberships).values({ userId: u!.id, tenantId: tenantA.id, role: "owner" });
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

async function generateToken(): Promise<string> {
  const res = await app.request(`/tenant/portal/clients/${ownerId}/token`, {
    method: "POST",
    headers: { "x-tenant-slug": SLUGS[0]!, cookie },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

type PortalData = {
  owner: { name: string };
  properties: Array<{
    title: string;
    price: number | null;
    upcomingVisits: unknown[];
    visitsDone: number;
    interested: number;
  }>;
};

describe("Portal del propietario", () => {
  it("genera token (idempotente) y el portal devuelve el rendimiento", async () => {
    const token = await generateToken();
    const again = await generateToken();
    expect(again).toBe(token); // no rota el enlace ya compartido

    // actividad: 1 visita futura, 1 hecha, 1 interesado
    const future = new Date(Date.now() + 86_400_000);
    await db.insert(visits).values([
      { tenantId: tenantA.id, propertyId: propId, name: "V1", scheduledAt: future, status: "confirmed" },
      { tenantId: tenantA.id, propertyId: propId, name: "V2", scheduledAt: new Date(Date.now() - 86_400_000), status: "done" },
    ]);
    await db.insert(clients).values({
      tenantId: tenantA.id,
      name: "Interesado",
      email: "int@x.com",
      stage: "lead",
      source: "microsite",
      interestPropertyId: propId,
    });

    const res = await app.request(`/tenant/portal/${token}`, {
      headers: { "x-tenant-slug": SLUGS[0]! },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as PortalData;
    expect(data.owner.name).toBe("Propietario A");
    expect(data.properties).toHaveLength(1);
    expect(data.properties[0]).toMatchObject({
      title: "Piso del portal",
      price: 250_000,
      visitsDone: 1,
      interested: 1,
    });
    expect(data.properties[0]!.upcomingVisits).toHaveLength(1);
    // sin datos personales del visitante
    expect(JSON.stringify(data)).not.toContain("V1");
  });

  it("token inválido → 404; token de A vía slug de B → 404 (aislamiento)", async () => {
    const token = await generateToken();

    const bad = await app.request(`/tenant/portal/${randomUUID()}`, {
      headers: { "x-tenant-slug": SLUGS[0]! },
    });
    expect(bad.status).toBe(404);

    const cross = await app.request(`/tenant/portal/${token}`, {
      headers: { "x-tenant-slug": SLUGS[1]! },
    });
    expect(cross.status).toBe(404);
  });

  it("generar token exige sesión (401) y módulo activo (403)", async () => {
    const anon = await app.request(`/tenant/portal/clients/${ownerId}/token`, {
      method: "POST",
      headers: { "x-tenant-slug": SLUGS[0]! },
    });
    expect(anon.status).toBe(401);

    await db.update(subscriptions).set({ active: false }).where(eq(subscriptions.tenantId, tenantA.id));
    await invalidateModules(tenantA.id);
    const gated = await app.request(`/tenant/portal/clients/${ownerId}/token`, {
      method: "POST",
      headers: { "x-tenant-slug": SLUGS[0]!, cookie },
    });
    expect(gated.status).toBe(403);
  });

  it("PATCH parcial NO resucita defaults: asignar propietario conserva status/kind", async () => {
    // Regresión zod v4: .partial() re-aplicaba .default() → status volvía a draft.
    const res = await app.request(`/tenant/properties/${propId}`, {
      method: "PATCH",
      headers: { "x-tenant-slug": SLUGS[0]!, cookie, "content-type": "application/json" },
      body: JSON.stringify({ ownerClientId: ownerId }),
    });
    expect(res.status).toBe(200);
    const { property } = (await res.json()) as { property: { status: string; operation: string } };
    expect(property.status).toBe("published"); // NO draft
    expect(property.operation).toBe("sale");
  });

  it("PATCH parcial de cliente conserva el stage (regresión defaults)", async () => {
    const res = await app.request(`/tenant/clients/${ownerId}`, {
      method: "PATCH",
      headers: { "x-tenant-slug": SLUGS[0]!, cookie, "content-type": "application/json" },
      body: JSON.stringify({ notes: "solo notas" }),
    });
    expect(res.status).toBe(200);
    const { client } = (await res.json()) as { client: { stage: string } };
    expect(client.stage).toBe("active"); // NO degradado a lead
  });

  it("PATCH property rechaza un ownerClientId de OTRO tenant", async () => {
    const [foreign] = await db
      .insert(clients)
      .values({ tenantId: tenantB.id, name: "De B", email: "b@x.com" })
      .returning();
    const res = await app.request(`/tenant/properties/${propId}`, {
      method: "PATCH",
      headers: { "x-tenant-slug": SLUGS[0]!, cookie, "content-type": "application/json" },
      body: JSON.stringify({ ownerClientId: foreign!.id }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as unknown).toMatchObject({ error: "invalid_owner" });
  });
});
