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

// Gastos y facturas por inmueble: subida multipart, categorías, aislamiento
// y visibilidad (con neto) en el portal del propietario.

const EMAIL = "test-expenses@example.com";
const PASSWORD = "super-secreta-123";
const SLUGS = ["test-exp-a", "test-exp-b"];

let tenantA: Tenant;
let tenantB: Tenant;
let ownerId: string;
let propId: string;
let cookie: string;

async function cleanup() {
  await db.delete(user).where(eq(user.email, EMAIL));
  await db.delete(tenants).where(inArray(tenants.slug, SLUGS));
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
    .values({ tenantId: tenantA.id, name: "Dueña Gastos", email: "dg@x.com" })
    .returning();
  ownerId = owner!.id;
  const [p] = await db
    .insert(properties)
    .values({ tenantId: tenantA.id, title: "Piso con gastos", status: "published", ownerClientId: ownerId })
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

function createExpense(fields: Record<string, string>, file?: { name: string; type: string }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) {
    fd.append("file", new File([new Uint8Array([37, 80, 68, 70])], file.name, { type: file.type }));
  }
  return app.request("/tenant/expenses", {
    method: "POST",
    headers: { "x-tenant-slug": SLUGS[0]!, cookie },
    body: fd,
  });
}

const year = new Date().getFullYear();

describe("Gastos por inmueble", () => {
  it("crea con factura PDF adjunta (céntimos correctos) y lista por inmueble", async () => {
    const res = await createExpense(
      {
        propertyId: propId,
        category: "electricity",
        amount: "43.27",
        expenseDate: `${year}-05-12`,
        concept: "Factura Iberdrola mayo",
      },
      { name: "iberdrola-mayo.pdf", type: "application/pdf" },
    );
    expect(res.status).toBe(201);
    const { expense } = (await res.json()) as {
      expense: { amountCents: number; fileUrl: string | null; fileName: string | null };
    };
    expect(expense.amountCents).toBe(4327);
    expect(expense.fileUrl).toBeTruthy();
    expect(expense.fileName).toBe("iberdrola-mayo.pdf");

    const list = await app.request(`/tenant/expenses?propertyId=${propId}`, {
      headers: { "x-tenant-slug": SLUGS[0]!, cookie },
    });
    const body = (await list.json()) as { expenses: unknown[] };
    expect(body.expenses).toHaveLength(1);
  });

  it("valida: categoría inválida 400, tipo de archivo no permitido 400, inmueble de otro tenant 400", async () => {
    expect(
      (
        await createExpense({
          propertyId: propId,
          category: "loquesea",
          amount: "10",
          expenseDate: `${year}-01-01`,
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await createExpense(
          { propertyId: propId, category: "water", amount: "10", expenseDate: `${year}-01-01` },
          { name: "x.exe", type: "application/octet-stream" },
        )
      ).status,
    ).toBe(400);

    const [foreign] = await db
      .insert(properties)
      .values({ tenantId: tenantB.id, title: "De B", status: "published" })
      .returning();
    expect(
      (
        await createExpense({
          propertyId: foreign!.id,
          category: "water",
          amount: "10",
          expenseDate: `${year}-01-01`,
        })
      ).status,
    ).toBe(400);
  });

  it("borra; sin sesión 401; sin módulo 403", async () => {
    await createExpense({ propertyId: propId, category: "community", amount: "80", expenseDate: `${year}-02-01` });
    const list = (await (
      await app.request("/tenant/expenses", { headers: { "x-tenant-slug": SLUGS[0]!, cookie } })
    ).json()) as { expenses: Array<{ id: string }> };
    const del = await app.request(`/tenant/expenses/${list.expenses[0]!.id}`, {
      method: "DELETE",
      headers: { "x-tenant-slug": SLUGS[0]!, cookie },
    });
    expect(del.status).toBe(204);

    expect(
      (await app.request("/tenant/expenses", { headers: { "x-tenant-slug": SLUGS[0]! } })).status,
    ).toBe(401);
    await db.update(subscriptions).set({ active: false }).where(eq(subscriptions.tenantId, tenantA.id));
    await invalidateModules(tenantA.id);
    expect(
      (await app.request("/tenant/expenses", { headers: { "x-tenant-slug": SLUGS[0]!, cookie } })).status,
    ).toBe(403);
  });

  it("el portal muestra gastos del año y las facturas", async () => {
    await createExpense(
      { propertyId: propId, category: "derrama", amount: "350", expenseDate: `${year}-03-01`, concept: "Derrama ascensor" },
      { name: "derrama.pdf", type: "application/pdf" },
    );
    await createExpense({ propertyId: propId, category: "water", amount: "25.50", expenseDate: `${year}-04-01` });

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
        expensesThisYearCents: number;
        latestExpenses: Array<{ category: string; fileUrl: string | null }>;
      }>;
    };
    expect(data.properties[0]!.expensesThisYearCents).toBe(37550); // 350 + 25,50
    expect(data.properties[0]!.latestExpenses).toHaveLength(2);
    expect(data.properties[0]!.latestExpenses.find((e) => e.category === "derrama")!.fileUrl).toBeTruthy();
  });
});
