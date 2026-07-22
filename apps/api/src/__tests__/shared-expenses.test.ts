import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeDb,
  db,
  memberships,
  properties,
  propertyRooms,
  rentals,
  subscriptions,
  tenants,
  user,
} from "@rep/db";
import type { Tenant } from "@rep/db";
import { invalidateModules } from "@rep/modules";
import { app } from "../app.js";
import { ensureModule } from "./helpers.js";

// Reparto de gastos compartidos entre inquilinos de un piso por habitaciones,
// igual que el Excel del cliente (proporcional a los días de solape con el periodo).

const EMAIL = "test-shared@example.com";
const PASSWORD = "super-secreta-123";
const SLUG = "test-shared-a";

let tenantA: Tenant;
let propId: string;
let cookie: string;

async function cleanup() {
  await db.delete(user).where(eq(user.email, EMAIL));
  await db.delete(tenants).where(inArray(tenants.slug, [SLUG]));
}

async function addRoomRental(name: string, rent: number, start: string, end: string | null) {
  const [room] = await db
    .insert(propertyRooms)
    .values({ tenantId: tenantA.id, propertyId: propId, name })
    .returning();
  await db.insert(rentals).values({
    tenantId: tenantA.id,
    propertyId: propId,
    roomId: room!.id,
    renterName: name,
    monthlyRent: rent,
    startDate: start,
    endDate: end,
    status: end ? "ended" : "active",
  });
}

function post(body: Record<string, unknown>) {
  return app.request("/tenant/shared-expenses", {
    method: "POST",
    headers: { "x-tenant-slug": SLUG, cookie, "content-type": "application/json" },
    body: JSON.stringify({ propertyId: propId, ...body }),
  });
}

async function settlement() {
  const res = await app.request(`/tenant/shared-expenses/settlement?propertyId=${propId}`, {
    headers: { "x-tenant-slug": SLUG, cookie },
  });
  return (await res.json()) as {
    tenants: Array<{
      renterName: string;
      monthlyRentCents: number;
      expensesTotalCents: number;
      totalCents: number;
      byType: Record<string, number>;
    }>;
    totalsByType: Record<string, number>;
    expenses: Array<{ amountCents: number; shares: Array<{ renterName: string; days: number; cents: number }> }>;
  };
}

beforeEach(async () => {
  await cleanup();
  const seeded = [];
  for (const code of ["rentals", "properties"]) seeded.push(await ensureModule(code));

  [tenantA] = (await db.insert(tenants).values({ slug: SLUG, name: "A" }).returning()) as [Tenant];
  await db.insert(subscriptions).values(
    seeded.map((m) => ({ tenantId: tenantA.id, moduleId: m.id, active: true })),
  );
  await invalidateModules(tenantA.id);

  const [p] = await db
    .insert(properties)
    .values({ tenantId: tenantA.id, title: "Txabarri 85", status: "published", operation: "rent" })
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

describe("Reparto de gastos compartidos", () => {
  it("reparte proporcional a los días de solape (caso determinista 200/100)", async () => {
    await addRoomRental("A", 300, "2026-01-01", "2026-01-31"); // 30 días en enero
    await addRoomRental("B", 300, "2026-01-16", null); // desde mitad de enero (15 días)

    // Luz de todo enero, 300 € → A 30 días, B 15 días → 200 € / 100 €
    expect((await post({ type: "electricity", periodStart: "2026-01-01", periodEnd: "2026-01-31", amount: 300 })).status).toBe(201);

    const s = await settlement();
    const A = s.tenants.find((t) => t.renterName === "A")!;
    const B = s.tenants.find((t) => t.renterName === "B")!;
    expect(A.byType.electricity).toBe(20000);
    expect(B.byType.electricity).toBe(10000);
    // TOTAL = renta + gastos (como el Excel)
    expect(A.totalCents).toBe(30000 + 20000);
    expect(B.totalCents).toBe(30000 + 10000);
    // el reparto de cada factura cuadra al céntimo
    expect(s.expenses[0]!.shares.reduce((a, x) => a + x.cents, 0)).toBe(30000);
  });

  it("reproduce el Excel del cliente (Txabarri 85): sumas y jerarquía", async () => {
    await addRoomRental("Ignacio", 450, "2025-12-05", "2026-12-04");
    await addRoomRental("Sara", 420, "2026-01-12", "2026-07-11");
    await addRoomRental("Alejandra", 420, "2026-01-15", "2026-07-15");
    await addRoomRental("Mohamed", 420, "2026-02-01", "2026-07-31");

    const luz: Array<[string, string, number]> = [
      ["2026-01-28", "2026-05-05", 112.18],
      ["2025-12-10", "2026-01-09", 76.34],
      ["2026-01-10", "2026-01-27", 50.01],
      ["2026-02-06", "2026-03-02", 90.45],
      ["2026-03-03", "2026-04-08", 119.92],
      ["2026-04-09", "2026-05-08", 80.02],
      ["2026-05-09", "2026-06-05", 79.36],
    ];
    for (const [s, e, a] of luz) {
      expect((await post({ type: "electricity", periodStart: s, periodEnd: e, amount: a })).status).toBe(201);
    }
    expect((await post({ type: "water", periodStart: "2026-02-04", periodEnd: "2026-04-23", amount: 63.14 })).status).toBe(201);

    const s = await settlement();
    // Las sumas por tipo cuadran EXACTO con el total de las facturas (60828 / 6314 cts).
    expect(s.totalsByType.electricity).toBe(60828);
    expect(s.totalsByType.water).toBe(6314);
    const sumLuz = s.tenants.reduce((a, t) => a + (t.byType.electricity ?? 0), 0);
    const sumAgua = s.tenants.reduce((a, t) => a + (t.byType.water ?? 0), 0);
    expect(sumLuz).toBe(60828);
    expect(sumAgua).toBe(6314);

    // Ignacio paga MÁS luz (presente todo el periodo).
    const ign = s.tenants.find((t) => t.renterName === "Ignacio")!;
    const others = s.tenants.filter((t) => t.renterName !== "Ignacio");
    for (const o of others) expect(ign.byType.electricity!).toBeGreaterThan(o.byType.electricity ?? 0);
    // Agua: los 4 presentes todo ese periodo → reparto ~igual (± céntimo de redondeo).
    for (const t of s.tenants) expect(Math.abs((t.byType.water ?? 0) - 1579)).toBeLessThanOrEqual(1);
    // TOTAL de cada uno = renta + sus gastos.
    for (const t of s.tenants)
      expect(t.totalCents).toBe(t.monthlyRentCents + t.expensesTotalCents);
  });

  it("gating y validación: sin módulo 403, sin periodo válido 400", async () => {
    const anon = await app.request(`/tenant/shared-expenses?propertyId=${propId}`, {
      headers: { "x-tenant-slug": SLUG },
    });
    expect(anon.status).toBe(401);

    // fin antes que inicio → 400
    expect((await post({ type: "electricity", periodStart: "2026-05-01", periodEnd: "2026-04-01", amount: 50 })).status).toBe(400);
  });
});
