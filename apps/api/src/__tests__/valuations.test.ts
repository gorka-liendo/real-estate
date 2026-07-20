import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clients, closeDb, db, modules, properties, subscriptions, tenants } from "@rep/db";
import type { Tenant } from "@rep/db";
import { invalidateModules } from "@rep/modules";
import { app } from "../app.js";
import { ensureModule } from "./helpers.js";
import { resetLeadThrottle } from "../modules/leads/leads.throttle.js";

// Widget de valoración: estimación desde comparables del tenant + lead
// source 'valuation'. Gating por módulo y aislamiento de comparables.

const SLUGS = ["test-val-a", "test-val-b"];
let tenantA: Tenant;
let tenantB: Tenant;

async function cleanup() {
  await db.delete(tenants).where(inArray(tenants.slug, SLUGS)); // cascade
}

beforeEach(async () => {
  await cleanup();
  resetLeadThrottle();
  const mod = await ensureModule("valuation");

  [tenantA] = (await db.insert(tenants).values({ slug: SLUGS[0]!, name: "A" }).returning()) as [Tenant];
  [tenantB] = (await db.insert(tenants).values({ slug: SLUGS[1]!, name: "B" }).returning()) as [Tenant];
  await db.insert(subscriptions).values([
    { tenantId: tenantA.id, moduleId: mod!.id, active: true },
    { tenantId: tenantB.id, moduleId: mod!.id, active: true },
  ]);
  await invalidateModules(tenantA.id);
  await invalidateModules(tenantB.id);
});

afterAll(async () => {
  await cleanup(); // el módulo 'valuation' del catálogo se deja (lo usa el seed)
  await closeDb();
});

function post(slug: string, body: unknown) {
  return app.request("/tenant/valuations", {
    method: "POST",
    headers: { "x-tenant-slug": slug, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Comparable publicado en venta del tenant indicado.
async function seedComparable(
  tenantId: string,
  price: number,
  areaM2: number,
  city = "Bilbao",
) {
  await db.insert(properties).values({
    tenantId,
    title: `Comparable ${price}`,
    status: "published",
    operation: "sale",
    kind: "flat",
    price,
    areaM2,
    city,
  });
}

type ValuationResponse = {
  ok: boolean;
  id: string;
  estimate: { low: number; high: number; pricePerM2: number; comparables: number } | null;
};

describe("Valoración de pisos", () => {
  it("estima con comparables del tenant y crea lead source 'valuation'", async () => {
    // 2 comparables a 3.000 €/m² → 100 m² ≈ 300.000 € (±10%)
    await seedComparable(tenantA.id, 300_000, 100);
    await seedComparable(tenantA.id, 240_000, 80);

    const res = await post(SLUGS[0]!, {
      name: "Propietario Uno",
      email: "prop@x.com",
      kind: "flat",
      areaM2: 100,
      city: "Bilbao",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ValuationResponse;
    expect(body.estimate).not.toBeNull();
    expect(body.estimate!.pricePerM2).toBe(3000);
    expect(body.estimate!.low).toBe(270_000);
    expect(body.estimate!.high).toBe(330_000);
    expect(body.estimate!.comparables).toBe(2);

    const rows = await db.select().from(clients).where(eq(clients.tenantId, tenantA.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stage: "lead", kind: "owner", source: "valuation" });
    expect(rows[0]!.notes).toContain("100 m²");
  });

  it("los comparables a precio 0 ('a consultar') no sesgan ni generan estimación", async () => {
    // Solo precio 0 → sin comparables usables → null (nunca "0 – 0 €").
    await seedComparable(tenantA.id, 0, 100);
    const res0 = await post(SLUGS[0]!, { name: "Solo Ceros", email: "c@x.com", kind: "flat", areaM2: 100 });
    expect(((await res0.json()) as ValuationResponse).estimate).toBeNull();

    // Mezcla: el 0 se excluye de la media (3000 €/m², no 1500).
    await seedComparable(tenantA.id, 300_000, 100);
    const res = await post(SLUGS[0]!, { name: "Mezcla", email: "m@x.com", kind: "flat", areaM2: 100 });
    const body = (await res.json()) as ValuationResponse;
    expect(body.estimate!.pricePerM2).toBe(3000);
    expect(body.estimate!.comparables).toBe(1);
  });

  it("sin comparables → estimate null pero el lead se guarda igual", async () => {
    const res = await post(SLUGS[0]!, {
      name: "Sin Cartera",
      phone: "600111222",
      kind: "house",
      areaM2: 150,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ValuationResponse;
    expect(body.estimate).toBeNull();

    const rows = await db.select().from(clients).where(eq(clients.tenantId, tenantA.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.notes).toContain("pendiente de valoración manual");
  });

  it("los comparables de OTRO tenant no contaminan la estimación (aislamiento)", async () => {
    // B tiene cartera; A no → A debe devolver estimate null.
    await seedComparable(tenantB.id, 500_000, 100);
    const res = await post(SLUGS[0]!, {
      name: "Aislado",
      email: "aislado@x.com",
      kind: "flat",
      areaM2: 100,
    });
    const body = (await res.json()) as ValuationResponse;
    expect(body.estimate).toBeNull();
  });

  it("tenant sin el módulo valuation → 403", async () => {
    await db.update(subscriptions).set({ active: false }).where(eq(subscriptions.tenantId, tenantA.id));
    await invalidateModules(tenantA.id);
    const res = await post(SLUGS[0]!, { name: "X", email: "x@x.com", areaM2: 90 });
    expect(res.status).toBe(403);
  });

  it("honeypot relleno → 204 sin insertar ni estimar", async () => {
    const res = await post(SLUGS[0]!, {
      name: "Bot",
      email: "bot@x.com",
      areaM2: 80,
      company: "spam",
    });
    expect(res.status).toBe(204);
    const rows = await db.select().from(clients).where(eq(clients.tenantId, tenantA.id));
    expect(rows).toHaveLength(0);
  });
});
