import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  clients,
  closeDb,
  db,
  memberships,
  modules,
  properties,
  rentals,
  subscriptions,
  tenants,
  user,
} from "@rep/db";
import type { Tenant } from "@rep/db";
import { invalidateModules } from "@rep/modules";
import { app } from "../app.js";
import { ensureModule } from "./helpers.js";

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
    seeded.push(await ensureModule(code));
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

function roomsReq(path = "", init: RequestInit = {}) {
  return app.request(`/tenant/rooms${path}`, {
    ...init,
    headers: { "x-tenant-slug": SLUGS[0]!, cookie, "content-type": "application/json", ...init.headers },
  });
}

async function createRoom(name: string): Promise<string> {
  const res = await roomsReq("", { method: "POST", body: JSON.stringify({ propertyId: propId, name }) });
  expect(res.status).toBe(201);
  return ((await res.json()) as { room: { id: string } }).room.id;
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

describe("Alquiler por habitaciones", () => {
  it("crea habitaciones, las lista y admite varios contratos activos (uno por habitación)", async () => {
    const room1 = await createRoom("Habitación 1");
    const room2 = await createRoom("Habitación 2");

    const list = (await (await roomsReq(`?propertyId=${propId}`)).json()) as { rooms: unknown[] };
    expect(list.rooms).toHaveLength(2);

    // dos contratos activos en el MISMO piso, por habitaciones distintas → OK
    const c1 = await req("", {
      method: "POST",
      body: JSON.stringify({ propertyId: propId, roomId: room1, renterName: "Inq 1", monthlyRent: 500, startDate: "2026-01-01" }),
    });
    expect(c1.status).toBe(201);
    const c2 = await req("", {
      method: "POST",
      body: JSON.stringify({ propertyId: propId, roomId: room2, renterName: "Inq 2", monthlyRent: 500, startDate: "2026-01-01" }),
    });
    expect(c2.status).toBe(201);

    // misma habitación otra vez → 409 room_occupied
    const dup = await req("", {
      method: "POST",
      body: JSON.stringify({ propertyId: propId, roomId: room1, renterName: "Inq 3", monthlyRent: 500, startDate: "2026-02-01" }),
    });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: string }).error).toBe("room_occupied");

    // piso entero con habitaciones activas → 409
    const whole = await req("", {
      method: "POST",
      body: JSON.stringify({ propertyId: propId, renterName: "Inq 4", monthlyRent: 1200, startDate: "2026-02-01" }),
    });
    expect(whole.status).toBe(409);
  });

  it("rechaza habitación de otro inmueble (400 invalid_room)", async () => {
    const [otherProp] = await db
      .insert(properties)
      .values({ tenantId: tenantA.id, title: "Otro piso", status: "published" })
      .returning();
    const foreignRoom = await createRoom("Habitación X"); // pertenece a propId
    const res = await req("", {
      method: "POST",
      body: JSON.stringify({ propertyId: otherProp!.id, roomId: foreignRoom, renterName: "Z", monthlyRent: 400, startDate: "2026-01-01" }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_room");
  });

  it("el portal agrega el piso por habitaciones: total + desglose", async () => {
    const room1 = await createRoom("Habitación 1");
    const room2 = await createRoom("Habitación 2");
    const year = new Date().getFullYear();
    const c1 = ((await (await req("", {
      method: "POST",
      body: JSON.stringify({ propertyId: propId, roomId: room1, renterName: "A", monthlyRent: 500, startDate: "2026-01-01" }),
    })).json()) as { rental: { id: string } }).rental.id;
    await req("", {
      method: "POST",
      body: JSON.stringify({ propertyId: propId, roomId: room2, renterName: "B", monthlyRent: 600, startDate: "2026-01-01" }),
    });
    // habitación 1: enero cobrado; habitación 2: nada
    await req(`/${c1}/payments/${year}-01`, { method: "PUT", body: JSON.stringify({ status: "paid" }) });

    const { token } = (await (await app.request(`/tenant/portal/clients/${ownerId}/token`, {
      method: "POST",
      headers: { "x-tenant-slug": SLUGS[0]!, cookie },
    })).json()) as { token: string };

    const data = (await (await app.request(`/tenant/portal/${token}`, {
      headers: { "x-tenant-slug": SLUGS[0]! },
    })).json()) as {
      properties: Array<{
        rental: {
          monthlyRent: number;
          collectedThisYear: number;
          byRoom: boolean;
          rooms: Array<{ label: string | null; monthlyRent: number; collectedThisYear: number }>;
        } | null;
      }>;
    };
    const r = data.properties[0]!.rental!;
    expect(r.byRoom).toBe(true);
    expect(r.monthlyRent).toBe(1100); // 500 + 600
    expect(r.collectedThisYear).toBe(500); // solo hab 1
    expect(r.rooms).toHaveLength(2);
    expect(r.rooms.map((x) => x.label)).toEqual(["Habitación 1", "Habitación 2"]);
  });

  it("no borra una habitación con contrato activo (409), sí una libre", async () => {
    const room = await createRoom("Habitación 1");
    await req("", {
      method: "POST",
      body: JSON.stringify({ propertyId: propId, roomId: room, renterName: "Inq", monthlyRent: 500, startDate: "2026-01-01" }),
    });
    const blocked = await roomsReq(`/${room}`, { method: "DELETE" });
    expect(blocked.status).toBe(409);

    const free = await createRoom("Habitación libre");
    expect((await roomsReq(`/${free}`, { method: "DELETE" })).status).toBe(200);
  });
});

describe("Detalle de gestión del contrato", () => {
  it("devuelve cobros + inmueble + inquilino y propietario vinculados", async () => {
    const [renter] = await db
      .insert(clients)
      .values({ tenantId: tenantA.id, name: "Inquilina CRM", email: "inq@x.com", stage: "active" })
      .returning();
    const create = await req("", {
      method: "POST",
      body: JSON.stringify({
        propertyId: propId,
        renterClientId: renter!.id,
        renterName: "Inquilina CRM",
        monthlyRent: 1200,
        startDate: "2026-01-01",
      }),
    });
    const id = ((await create.json()) as { rental: { id: string } }).rental.id;
    await req(`/${id}/payments/2026-03`, { method: "PUT", body: JSON.stringify({ status: "paid" }) });

    const res = await req(`/${id}`);
    expect(res.status).toBe(200);
    const detail = (await res.json()) as {
      rental: { id: string };
      payments: unknown[];
      property: { id: string; title: string } | null;
      tenant: { id: string; name: string } | null;
      owner: { id: string; name: string } | null;
    };
    expect(detail.rental.id).toBe(id);
    expect(detail.payments).toHaveLength(1);
    expect(detail.property!.title).toBe("Piso alquilado");
    expect(detail.tenant).toMatchObject({ id: renter!.id, name: "Inquilina CRM" });
    expect(detail.owner).toMatchObject({ id: ownerId, name: "Dueña Renta" });
  });

  it("404 si el contrato no existe o es de otro tenant", async () => {
    expect((await req("/00000000-0000-0000-0000-000000000000")).status).toBe(404);

    const [foreignProp] = await db
      .insert(properties)
      .values({ tenantId: tenantB.id, title: "De B", status: "published" })
      .returning();
    const [foreignRental] = await db
      .insert(rentals)
      .values({
        tenantId: tenantB.id,
        propertyId: foreignProp!.id,
        renterName: "Ajeno",
        monthlyRent: 700,
        startDate: "2026-01-01",
      })
      .returning();
    expect((await req(`/${foreignRental!.id}`)).status).toBe(404);
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
      rental: {
        byRoom: boolean;
        rooms: Array<{ label: string | null; payments: Array<{ period: string; status: string }> }>;
      } | null;
      monthly: Array<{ incomeCents: number }>;
    };
    // piso entero → una sola línea (label null) con el registro íntegro
    expect(detail.rental!.byRoom).toBe(false);
    expect(detail.rental!.rooms).toHaveLength(1);
    expect(detail.rental!.rooms[0]!.label).toBeNull();
    expect(detail.rental!.rooms[0]!.payments).toHaveLength(4); // registro íntegro, no solo 6 últimos
    expect(detail.rental!.rooms[0]!.payments[0]!.period).toBe(`${year}-04`); // desc
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

  it("un contrato FINALIZADO sigue reflejando los cobros del año en el portal", async () => {
    const id = await createRental();
    const year = new Date().getFullYear();
    await req(`/${id}/payments/${year}-01`, { method: "PUT", body: JSON.stringify({ status: "paid" }) });
    await req(`/${id}/payments/${year}-02`, { method: "PUT", body: JSON.stringify({ status: "paid" }) });
    await req(`/${id}/payments/${year}-03`, { method: "PUT", body: JSON.stringify({ status: "pending" }) });

    // finalizar el contrato
    const end = await req(`/${id}`, { method: "PATCH", body: JSON.stringify({ status: "ended" }) });
    expect(end.status).toBe(200);

    const tokenRes = await app.request(`/tenant/portal/clients/${ownerId}/token`, {
      method: "POST",
      headers: { "x-tenant-slug": SLUGS[0]!, cookie },
    });
    const { token } = (await tokenRes.json()) as { token: string };

    const portal = await app.request(`/tenant/portal/${token}`, {
      headers: { "x-tenant-slug": SLUGS[0]! },
    });
    const data = (await portal.json()) as {
      summary: { collectedThisYearCents: number; netThisYearCents: number; pendingPayments: number };
      properties: Array<{ rental: { active: boolean; collectedThisYear: number } | null }>;
    };
    // el contrato ya no está activo, pero el dinero cobrado este año NO desaparece
    expect(data.properties[0]!.rental).not.toBeNull();
    expect(data.properties[0]!.rental!.active).toBe(false);
    expect(data.properties[0]!.rental!.collectedThisYear).toBe(2400); // 2 meses cobrados
    expect(data.summary.collectedThisYearCents).toBe(240000);
    expect(data.summary.netThisYearCents).toBe(240000); // sin gastos
    // pero un contrato finalizado NO genera "meses pendientes" que reclamar
    expect(data.summary.pendingPayments).toBe(0);
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
          byRoom: boolean;
          rooms: Array<{ label: string | null; pendingMonths: number }>;
        } | null;
      }>;
    };
    expect(data.properties[0]!.rental).not.toBeNull();
    expect(data.properties[0]!.rental!.monthlyRent).toBe(1200);
    expect(data.properties[0]!.rental!.collectedThisYear).toBe(2400); // 2 meses cobrados
    // piso entero → una línea, con 1 mes pendiente
    expect(data.properties[0]!.rental!.byRoom).toBe(false);
    expect(data.properties[0]!.rental!.rooms).toHaveLength(1);
    expect(data.properties[0]!.rental!.rooms[0]!.pendingMonths).toBe(1);
    expect(JSON.stringify(data)).not.toContain("Inquilino Uno"); // privacidad
  });
});
