import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clients, closeDb, db, modules, subscriptions, tenants } from "@rep/db";
import type { Tenant } from "@rep/db";
import { invalidateModules } from "@rep/modules";
import { app } from "../app.js";
import { resetLeadThrottle } from "../modules/leads/leads.throttle.js";

// Captación de leads: POST público del micrositio → cliente stage 'lead'.
// Gating por 'microsite', honeypot, validación y aislamiento entre tenants.

const SLUGS = ["test-lead-a", "test-lead-b"];
let tenantA: Tenant;
let tenantB: Tenant;

async function cleanup() {
  await db.delete(tenants).where(inArray(tenants.slug, SLUGS)); // cascade → clients, subs
}

beforeEach(async () => {
  await cleanup();
  resetLeadThrottle();
  const [mod] = await db
    .insert(modules)
    .values({ code: "microsite", name: "Micrositio", priceMonthly: 0 })
    .onConflictDoUpdate({ target: modules.code, set: { name: "Micrositio" } })
    .returning();

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
  await cleanup(); // el módulo 'microsite' del catálogo se deja (lo usa el seed)
  await closeDb();
});

function post(slug: string, body: unknown) {
  return app.request("/tenant/leads", {
    method: "POST",
    headers: { "x-tenant-slug": slug, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Captación de leads", () => {
  it("crea un cliente stage 'lead' source 'microsite' con el inmueble de interés", async () => {
    const propertyId = randomUUID();
    const res = await post(SLUGS[0]!, {
      name: "Marta Ruiz",
      email: "marta@x.com",
      message: "Me interesa este ático",
      propertyId,
    });
    expect(res.status).toBe(201);

    const rows = await db.select().from(clients).where(eq(clients.tenantId, tenantA.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Marta Ruiz",
      email: "marta@x.com",
      stage: "lead",
      source: "microsite",
      interestPropertyId: propertyId,
      notes: "Me interesa este ático",
    });
  });

  it("honeypot relleno → 204 y NO inserta", async () => {
    const res = await post(SLUGS[0]!, {
      name: "Bot",
      email: "bot@x.com",
      company: "spam-corp", // campo trampa
    });
    expect(res.status).toBe(204);
    const rows = await db.select().from(clients).where(eq(clients.tenantId, tenantA.id));
    expect(rows).toHaveLength(0);
  });

  it("sin email ni teléfono → 400", async () => {
    const res = await post(SLUGS[0]!, { name: "Sin contacto" });
    expect(res.status).toBe(400);
  });

  it("tenant sin el módulo microsite → 403", async () => {
    await db.update(subscriptions).set({ active: false }).where(eq(subscriptions.tenantId, tenantA.id));
    await invalidateModules(tenantA.id);
    const res = await post(SLUGS[0]!, { name: "X", email: "x@x.com" });
    expect(res.status).toBe(403);
    expect((await res.json()) as unknown).toMatchObject({ error: "module_not_active" });
  });

  it("el lead aterriza solo en el tenant del header (aislamiento)", async () => {
    await post(SLUGS[0]!, { name: "Lead de A", phone: "600100200" });
    const rowsA = await db.select().from(clients).where(eq(clients.tenantId, tenantA.id));
    const rowsB = await db.select().from(clients).where(eq(clients.tenantId, tenantB.id));
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(0);
  });
});
