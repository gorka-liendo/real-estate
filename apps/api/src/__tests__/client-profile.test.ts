import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  clients,
  closeDb,
  db,
  memberships,
  modules,
  properties,
  rentalPayments,
  rentals,
  subscriptions,
  tenants,
  user,
  visits,
} from "@rep/db";
import type { Tenant } from "@rep/db";
import { invalidateModules } from "@rep/modules";
import { app } from "../app.js";

// Perfil de cliente: tipos, cuota, roles derivados, timeline y notas.
// Y el portal SOLO para clientes con inmuebles asignados.

const EMAIL = "test-profile@example.com";
const PASSWORD = "super-secreta-123";
const SLUGS = ["test-prof-a"];

let tenantA: Tenant;
let clientId: string;
let propId: string;
let cookie: string;

async function cleanup() {
  await db.delete(user).where(eq(user.email, EMAIL));
  await db.delete(tenants).where(inArray(tenants.slug, SLUGS));
}

beforeEach(async () => {
  await cleanup();
  const seeded = [];
  for (const code of ["clients", "properties", "owner_portal", "rentals", "visits"]) {
    const [m] = await db
      .insert(modules)
      .values({ code, name: code, priceMonthly: 0 })
      .onConflictDoUpdate({ target: modules.code, set: { name: code } })
      .returning();
    seeded.push(m!);
  }
  [tenantA] = (await db.insert(tenants).values({ slug: SLUGS[0]!, name: "A" }).returning()) as [Tenant];
  await db
    .insert(subscriptions)
    .values(seeded.map((m) => ({ tenantId: tenantA.id, moduleId: m.id, active: true })));
  await invalidateModules(tenantA.id);

  const [c] = await db
    .insert(clients)
    .values({ tenantId: tenantA.id, name: "Perfil Test", email: "pt@x.com", stage: "active" })
    .returning();
  clientId = c!.id;
  const [p] = await db
    .insert(properties)
    .values({ tenantId: tenantA.id, title: "Piso Perfil", status: "published" })
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

function req(path: string, init: RequestInit = {}) {
  return app.request(`/tenant/clients${path}`, {
    ...init,
    headers: { "x-tenant-slug": SLUGS[0]!, cookie, "content-type": "application/json", ...init.headers },
  });
}

describe("Perfil de cliente", () => {
  it("PATCH tipo y cuota; el perfil deriva roles y compone el timeline", async () => {
    // tipo + cuota
    const patch = await req(`/${clientId}`, {
      method: "PATCH",
      body: JSON.stringify({ kind: "renter", monthlyFeeCents: 95000 }),
    });
    expect(patch.status).toBe(200);
    const patched = (await patch.json()) as { client: { kind: string; monthlyFeeCents: number; stage: string } };
    expect(patched.client).toMatchObject({ kind: "renter", monthlyFeeCents: 95000, stage: "active" });

    // actividad: dueño de un piso + contrato como inquilino + pago + visita
    await db.update(properties).set({ ownerClientId: clientId }).where(eq(properties.id, propId));
    const [rental] = await db
      .insert(rentals)
      .values({
        tenantId: tenantA.id,
        propertyId: propId,
        renterClientId: clientId,
        renterName: "Perfil Test",
        monthlyRent: 950,
        startDate: "2026-01-01",
      })
      .returning();
    await db.insert(rentalPayments).values({
      tenantId: tenantA.id,
      rentalId: rental!.id,
      period: "2026-06-01",
      amount: 950,
      status: "paid",
      paidAt: new Date(),
    });
    await db.insert(visits).values({
      tenantId: tenantA.id,
      propertyId: propId,
      clientId,
      name: "Perfil Test",
      scheduledAt: new Date(Date.now() + 86_400_000),
      status: "confirmed",
    });

    const res = await req(`/${clientId}/profile`);
    expect(res.status).toBe(200);
    const prof = (await res.json()) as {
      ownedProperties: unknown[];
      rentingContracts: Array<{ monthlyRent: number }>;
      timeline: Array<{ type: string; label: string }>;
      notes: unknown[];
    };
    expect(prof.ownedProperties).toHaveLength(1);
    expect(prof.rentingContracts[0]!.monthlyRent).toBe(950);
    const types = prof.timeline.map((t) => t.type);
    expect(types).toContain("created");
    expect(types).toContain("visit");
    expect(types).toContain("rental");
    expect(types).toContain("payment");
    expect(prof.timeline.find((t) => t.type === "payment")!.label).toContain("junio");
  });

  it("notas: añade y aparecen en el perfil (desc); vacía → 400", async () => {
    expect(
      (await req(`/${clientId}/notes`, { method: "POST", body: JSON.stringify({ body: "" }) })).status,
    ).toBe(400);
    await req(`/${clientId}/notes`, { method: "POST", body: JSON.stringify({ body: "Primera nota" }) });
    const second = await req(`/${clientId}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: "Prefiere llamadas por la tarde" }),
    });
    expect(second.status).toBe(201);

    const prof = (await (await req(`/${clientId}/profile`)).json()) as {
      notes: Array<{ body: string }>;
    };
    expect(prof.notes).toHaveLength(2);
    expect(prof.notes[0]!.body).toBe("Prefiere llamadas por la tarde");
  });

  it("el enlace del portal SOLO se genera si el cliente tiene inmuebles (400 no_properties)", async () => {
    const denied = await app.request(`/tenant/portal/clients/${clientId}/token`, {
      method: "POST",
      headers: { "x-tenant-slug": SLUGS[0]!, cookie },
    });
    expect(denied.status).toBe(400);
    expect((await denied.json()) as unknown).toMatchObject({ error: "no_properties" });

    await db.update(properties).set({ ownerClientId: clientId }).where(eq(properties.id, propId));
    const ok = await app.request(`/tenant/portal/clients/${clientId}/token`, {
      method: "POST",
      headers: { "x-tenant-slug": SLUGS[0]!, cookie },
    });
    expect(ok.status).toBe(200);
  });
});
