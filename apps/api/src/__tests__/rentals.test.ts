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
} from "@rep/db";
import type { Tenant } from "@rep/db";
import { invalidateModules } from "@rep/modules";
import { app } from "../app.js";

// Alquileres: contratos + cobros mensuales + rendimiento en el portal.

const EMAIL = "test-rentals@example.com";
const PASSWORD = "super-secreta-123";
const SLUGS = ["test-ren-a", "test-ren-b"];

let tenantA: Tenant;
let tenantB: Tenant;
let ownerId: string;
let propId: string;
let cookie: string;

async function cleanup() {
  await db.delete(user).where(eq(user.email, EMAIL));
  await db.delete(tenants).where(inArray(tenants.slug, SLUGS)); // cascade
}

beforeEach(async () => {
  await cleanup();
  const seeded = [];
  for (const code of ["rentals", "owner_portal", "properties", "clients"]) {
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
    .values({ tenantId: tenantA.id, name: "Dueña Renta", email: "duena@x.com", stage: "active" })
    .returning();
  ownerId = owner!.id;

  const [p] = await db
    .insert(properties)
    .values({
      tenantId: tenantA.id,
      title: "Piso alquilado",
      status: "published",
      operation: "rent",
      price: 1200,
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

function req(path = "", init: RequestInit = {}) {
  return app.request(`/tenant/rentals${path}`, {
    ...init,
    headers: { "x-tenant-slug": SLUGS[0]!, cookie, "content-type": "application/json", ...init.headers },
  });
}

async function createRental(): Promise<string> {
  const res = await req("", {
    method: "POST",
    body: JSON.stringify({
      propertyId: propId,
      renterName: "Inquilino Uno",
      monthlyRent: 1200,
      startDate: "2026-01-01",
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { rental: { id: string } }).rental.id;
}

describe("Contratos de alquiler", () => {
  it("crea, lista y solo permite UN contrato activo por inmueble (409)", async () => {
    const id = await createRental();

    const dup = await req("", {
      method: "POST",
      body: JSON.stringify({
        propertyId: propId,
        renterName: "Otro",
        monthlyRent: 900,
        startDate: "2026-02-01",
      }),
    });
    expect(dup.status).toBe(409);

    // finalizado → se puede abrir otro
    const end = await req(`/${id}`, { method: "PATCH", body: JSON.stringify({ status: "ended" }) });
    expect(end.status).toBe(200);
    const ended = (await end.json()) as { rental: { status: string; endDate: string | null } };
    expect(ended.rental.status).toBe("ended");
    expect(ended.rental.endDate).not.toBeNull(); // fecha de fin automática

    const again = await req("", {
      method: "POST",
      body: JSON.stringify({
        propertyId: propId,
        renterName: "Nuevo Inquilino",
        monthlyRent: 1300,
        startDate: "2026-08-01",
      }),
    });
    expect(again.status).toBe(201);

    const list = (await (await req("")).json()) as { rentals: unknown[] };
    expect(list.rentals).toHaveLength(2);
  });

  it("valida inmueble e inquilino del tenant (400)", async () => {
    const [foreignProp] = await db
      .insert(properties)
      .values({ tenantId: tenantB.id, title: "De B", status: "published" })
      .returning();
    const res = await req("", {
      method: "POST",
      body: JSON.stringify({
        propertyId: foreignProp!.id,
        renterName: "X",
        monthlyRent: 800,
        startDate: "2026-01-01",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("gating: sin módulo → 403; sin sesión → 401", async () => {
    const anon = await app.request("/tenant/rentals", { headers: { "x-tenant-slug": SLUGS[0]! } });
    expect(anon.status).toBe(401);

    await db.update(subscriptions).set({ active: false }).where(eq(subscriptions.tenantId, tenantA.id));
    await invalidateModules(tenantA.id);
    expect((await req("")).status).toBe(403);
  });
});

describe("Cobros mensuales", () => {
  it("upsert idempotente por mes: registra, corrige y default al alquiler", async () => {
    const id = await createRental();

    // marcar julio cobrado (amount por defecto = monthlyRent)
    const paid = await req(`/${id}/payments/2026-07`, {
      method: "PUT",
      body: JSON.stringify({ status: "paid" }),
    });
    expect(paid.status).toBe(200);
    const p1 = (await paid.json()) as { payment: { amount: number; status: string; paidAt: string | null } };
    expect(p1.payment).toMatchObject({ amount: 1200, status: "paid" });
    expect(p1.payment.paidAt).not.toBeNull();

    // corregir el MISMO mes a pendiente (upsert, no duplica)
    const fix = await req(`/${id}/payments/2026-07`, {
      method: "PUT",
      body: JSON.stringify({ status: "pending" }),
    });
    expect(((await fix.json()) as { payment: { status: string; paidAt: string | null } }).payment).toMatchObject(
      { status: "pending", paidAt: null },
    );

    const list = (await (await req("")).json()) as {
      rentals: Array<{ payments: Array<{ period: string }> }>;
    };
    expect(list.rentals[0]!.payments).toHaveLength(1); // un solo registro del mes

    // periodo inválido → 400
    expect((await req(`/${id}/payments/2026-13`, { method: "PUT", body: JSON.stringify({ status: "paid" }) })).status).toBe(400);
  });

  it("detalle por inmueble: registro COMPLETO de cobros y 404 si no es del dueño", async () => {
    const id = await createRental();
    const year = new Date().getFullYear();
    for (const [m, st] of [["01", "paid"], ["02", "paid"], ["03", "pending"], ["04", "paid"]] as const) {
      await req(`/${id}/payments/${year}-${m}`, { method: "PUT", body: JSON.stringify({ status: st }) });
    }

    const tokenRes = await app.request(`/tenant/portal/clients/${ownerId}/token`, {
      method: "POST",
      headers: { "x-tenant-slug": SLUGS[0]!, cookie },
    });
    const { token } = (await tokenRes.json()) as { token: string };

    const res = await app.request(`/tenant/portal/${token}/properties/${propId}`, {
      headers: { "x-tenant-slug": SLUGS[0]! },
    });
    expect(res.status).toBe(200);
    const detail = (await res.json()) as {
      rental: { payments: Array<{ period: string; status: string }> } | null;
      monthly: Array<{ incomeCents: number }>;
    };
    expect(detail.rental!.payments).toHaveLength(4); // registro íntegro, no solo 6 últimos
    expect(detail.rental!.payments[0]!.period).toBe(`${year}-04`); // desc
    expect(detail.monthly).toHaveLength(12);

    // inmueble del tenant que NO es del dueño del token → 404
    const [otherProp] = await db
      .insert(properties)
      .values({ tenantId: tenantA.id, title: "De otro dueño", status: "published" })
      .returning();
    const cross = await app.request(`/tenant/portal/${token}/properties/${otherProp!.id}`, {
      headers: { "x-tenant-slug": SLUGS[0]! },
    });
    expect(cross.status).toBe(404);
  });

  it("el rendimiento llega al portal del propietario (sin identidad del inquilino)", async () => {
    const id = await createRental();
    const year = new Date().getFullYear();
    await req(`/${id}/payments/${year}-01`, { method: "PUT", body: JSON.stringify({ status: "paid" }) });
    await req(`/${id}/payments/${year}-02`, { method: "PUT", body: JSON.stringify({ status: "paid" }) });
    await req(`/${id}/payments/${year}-03`, { method: "PUT", body: JSON.stringify({ status: "pending" }) });

    const tokenRes = await app.request(`/tenant/portal/clients/${ownerId}/token`, {
      method: "POST",
      headers: { "x-tenant-slug": SLUGS[0]!, cookie },
    });
    const { token } = (await tokenRes.json()) as { token: string };

    const portal = await app.request(`/tenant/portal/${token}`, {
      headers: { "x-tenant-slug": SLUGS[0]! },
    });
    const data = (await portal.json()) as {
      properties: Array<{
        rental: {
          monthlyRent: number;
          collectedThisYear: number;
          months: Array<{ status: string }>;
        } | null;
      }>;
    };
    expect(data.properties[0]!.rental).not.toBeNull();
    expect(data.properties[0]!.rental!.monthlyRent).toBe(1200);
    expect(data.properties[0]!.rental!.collectedThisYear).toBe(2400); // 2 meses cobrados
    expect(data.properties[0]!.rental!.months).toHaveLength(3);
    expect(JSON.stringify(data)).not.toContain("Inquilino Uno"); // privacidad
  });
});
