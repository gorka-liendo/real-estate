import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  clients,
  closeDb,
  db,
  invoices as invoicesTable,
  memberships,
  properties,
  subscriptions,
  tenants,
  user,
} from "@rep/db";
import type { Tenant } from "@rep/db";
import { invalidateModules } from "@rep/modules";
import { app } from "../app.js";
import { ensureModule } from "./helpers.js";

// Contabilidad: gastos (expense, absorbe lo que era property_expenses) y
// facturas emitidas (income, con numeración e IVA) + pagos + portal.

const EMAIL = "test-invoices@example.com";
const PASSWORD = "super-secreta-123";
const SLUGS = ["test-inv-a", "test-inv-b"];
const year = new Date().getFullYear();

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
  for (const code of ["accounting", "owner_portal", "properties", "clients"]) {
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
    .values({ tenantId: tenantA.id, name: "Dueña Facturas", email: "df@x.com" })
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

function slug(s: string[] = SLUGS) {
  return s[0]!;
}

function createExpense(
  fields: Record<string, string>,
  file?: { name: string; type: string },
  tenantSlug = SLUGS[0]!,
) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) {
    fd.append("file", new File([new Uint8Array([37, 80, 68, 70])], file.name, { type: file.type }));
  }
  return app.request("/tenant/invoices/expense", {
    method: "POST",
    headers: { "x-tenant-slug": tenantSlug, cookie },
    body: fd,
  });
}

function createIncome(body: Record<string, unknown>, tenantSlug = SLUGS[0]!) {
  return app.request("/tenant/invoices/income", {
    method: "POST",
    headers: { "x-tenant-slug": tenantSlug, cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type InvoiceJson = {
  id: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  number: string | null;
  concept: string | null;
  fileUrl: string | null;
  fileName: string | null;
  paidCents: number;
  propertyId: string | null;
};

describe("Gastos (expense)", () => {
  it("crea con factura PDF adjunta (céntimos correctos), sin piso queda pagado por defecto", async () => {
    const res = await createExpense(
      {
        propertyId: propId,
        category: "electricity",
        amount: "43.27",
        issueDate: `${year}-05-12`,
        concept: "Factura Iberdrola mayo",
      },
      { name: "iberdrola-mayo.pdf", type: "application/pdf" },
    );
    expect(res.status).toBe(201);
    const { invoice } = (await res.json()) as { invoice: InvoiceJson };
    expect(invoice.totalCents).toBe(4327);
    expect(invoice.fileUrl).toBeTruthy();
    expect(invoice.fileName).toBe("iberdrola-mayo.pdf");
    expect(invoice.status).toBe("paid");
    expect(invoice.paidCents).toBe(4327); // pagado automáticamente al crear

    const list = await app.request(`/tenant/invoices?propertyId=${propId}`, {
      headers: { "x-tenant-slug": slug(), cookie },
    });
    const body = (await list.json()) as { invoices: unknown[] };
    expect(body.invoices).toHaveLength(1);
  });

  it("gasto SIN inmueble (general de la agencia) — antes era imposible", async () => {
    const res = await createExpense({
      category: "other",
      amount: "29.99",
      issueDate: `${year}-01-10`,
      concept: "Suscripción software",
    });
    expect(res.status).toBe(201);
    const { invoice } = (await res.json()) as { invoice: InvoiceJson };
    expect(invoice.propertyId).toBeNull();
  });

  it("status='pending' NO registra pago automático", async () => {
    const res = await createExpense({
      category: "taxes",
      amount: "120",
      issueDate: `${year}-02-01`,
      status: "pending",
    });
    const { invoice } = (await res.json()) as { invoice: InvoiceJson };
    expect(invoice.status).toBe("pending");
    expect(invoice.paidCents).toBe(0);
  });

  it("valida: categoría inválida 400, archivo no permitido 400, inmueble/cliente de otro tenant 400", async () => {
    expect(
      (await createExpense({ propertyId: propId, category: "loquesea", amount: "10", issueDate: `${year}-01-01` }))
        .status,
    ).toBe(400);

    expect(
      (
        await createExpense(
          { propertyId: propId, category: "water", amount: "10", issueDate: `${year}-01-01` },
          { name: "x.exe", type: "application/octet-stream" },
        )
      ).status,
    ).toBe(400);

    const [foreignProp] = await db
      .insert(properties)
      .values({ tenantId: tenantB.id, title: "De B", status: "published" })
      .returning();
    expect(
      (await createExpense({ propertyId: foreignProp!.id, category: "water", amount: "10", issueDate: `${year}-01-01` }))
        .status,
    ).toBe(400);

    const [foreignClient] = await db
      .insert(clients)
      .values({ tenantId: tenantB.id, name: "De B" })
      .returning();
    expect(
      (
        await createExpense({
          clientId: foreignClient!.id,
          category: "water",
          amount: "10",
          issueDate: `${year}-01-01`,
        })
      ).status,
    ).toBe(400);
  });

  it("borra SOLO sin pagos (409 has_payments si ya tiene); sin sesión 401; sin módulo 403", async () => {
    // sin pagos → borrable
    const pending = await createExpense({ category: "community", amount: "80", issueDate: `${year}-02-01`, status: "pending" });
    const { invoice: pendingInvoice } = (await pending.json()) as { invoice: InvoiceJson };
    const del = await app.request(`/tenant/invoices/${pendingInvoice.id}`, {
      method: "DELETE",
      headers: { "x-tenant-slug": slug(), cookie },
    });
    expect(del.status).toBe(204);

    // con pago (creado 'paid' → tiene un invoice_payment) → 409
    const paid = await createExpense({ category: "community", amount: "80", issueDate: `${year}-02-01` });
    const { invoice: paidInvoice } = (await paid.json()) as { invoice: InvoiceJson };
    const delPaid = await app.request(`/tenant/invoices/${paidInvoice.id}`, {
      method: "DELETE",
      headers: { "x-tenant-slug": slug(), cookie },
    });
    expect(delPaid.status).toBe(409);

    expect((await app.request("/tenant/invoices", { headers: { "x-tenant-slug": slug() } })).status).toBe(401);

    await db.update(subscriptions).set({ active: false }).where(eq(subscriptions.tenantId, tenantA.id));
    await invalidateModules(tenantA.id);
    expect(
      (await app.request("/tenant/invoices", { headers: { "x-tenant-slug": slug(), cookie } })).status,
    ).toBe(403);
  });
});

describe("Facturas emitidas (income)", () => {
  it("calcula IVA correctamente y numera de forma correlativa por año", async () => {
    const res1 = await createIncome({
      clientId: ownerId,
      category: "management_fee",
      concept: "Honorarios de gestión — junio",
      amount: 500,
      taxRatePercent: 21,
      issueDate: `${year}-06-01`,
    });
    expect(res1.status).toBe(201);
    const { invoice: inv1 } = (await res1.json()) as { invoice: InvoiceJson };
    expect(inv1.subtotalCents).toBe(50_000);
    expect(inv1.taxCents).toBe(10_500);
    expect(inv1.totalCents).toBe(60_500);
    expect(inv1.number).toBe(`${year}-0001`);
    expect(inv1.status).toBe("pending");

    const res2 = await createIncome({
      clientId: ownerId,
      category: "commission",
      concept: "Comisión de venta",
      amount: 3000,
      issueDate: `${year}-06-15`,
    });
    const { invoice: inv2 } = (await res2.json()) as { invoice: InvoiceJson };
    expect(inv2.number).toBe(`${year}-0002`);
  });

  it("concept obligatorio (400); propertyId/clientId/rentalId de otro tenant → 400", async () => {
    expect(
      (await createIncome({ amount: 100, issueDate: `${year}-01-01` })).status, // sin concept
    ).toBe(400);

    const [foreignProp] = await db
      .insert(properties)
      .values({ tenantId: tenantB.id, title: "De B", status: "published" })
      .returning();
    expect(
      (
        await createIncome({
          propertyId: foreignProp!.id,
          concept: "x",
          amount: 100,
          issueDate: `${year}-01-01`,
        })
      ).status,
    ).toBe(400);
  });
});

describe("Edición", () => {
  it("edita concepto/categoría/importe/IVA de una factura emitida sin pagos", async () => {
    const res = await createIncome({
      clientId: ownerId,
      concept: "Honorarios de gestión",
      amount: 500,
      taxRatePercent: 21,
      issueDate: `${year}-01-01`,
    });
    const { invoice } = (await res.json()) as { invoice: InvoiceJson };

    const patched = await app.request(`/tenant/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "x-tenant-slug": slug(), cookie, "content-type": "application/json" },
      body: JSON.stringify({ concept: "Honorarios corregidos", amount: 600, taxRatePercent: 10 }),
    });
    expect(patched.status).toBe(200);
    const { invoice: updated } = (await patched.json()) as { invoice: InvoiceJson };
    expect(updated.concept).toBe("Honorarios corregidos");
    expect(updated.subtotalCents).toBe(60_000);
    expect(updated.taxCents).toBe(6_000);
    expect(updated.totalCents).toBe(66_000);
  });

  it("bloquea tocar importe/IVA si ya tiene pagos (400 has_payments); notas/estado siguen editables", async () => {
    const res = await createIncome({
      clientId: ownerId,
      concept: "Honorarios",
      amount: 100,
      issueDate: `${year}-01-01`,
    });
    const { invoice } = (await res.json()) as { invoice: InvoiceJson };
    await app.request(`/tenant/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "x-tenant-slug": slug(), cookie, "content-type": "application/json" },
      body: JSON.stringify({ amount: 50 }),
    });

    const blocked = await app.request(`/tenant/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "x-tenant-slug": slug(), cookie, "content-type": "application/json" },
      body: JSON.stringify({ amount: 999 }),
    });
    expect(blocked.status).toBe(400);
    const blockedBody = (await blocked.json()) as { error: string };
    expect(blockedBody.error).toBe("has_payments");

    const notesOk = await app.request(`/tenant/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "x-tenant-slug": slug(), cookie, "content-type": "application/json" },
      body: JSON.stringify({ notes: "seguimiento" }),
    });
    expect(notesOk.status).toBe(200);
  });

  it("valida el nuevo inmueble/cliente al editar (400 invalid_property); 404 si no existe", async () => {
    const res = await createExpense({ category: "water", amount: "10", issueDate: `${year}-01-01` });
    const { invoice } = (await res.json()) as { invoice: InvoiceJson };

    const invalid = await app.request(`/tenant/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "x-tenant-slug": slug(), cookie, "content-type": "application/json" },
      body: JSON.stringify({ propertyId: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(invalid.status).toBe(400);

    const missing = await app.request(`/tenant/invoices/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH",
      headers: { "x-tenant-slug": slug(), cookie, "content-type": "application/json" },
      body: JSON.stringify({ concept: "x" }),
    });
    expect(missing.status).toBe(404);
  });
});

describe("Pagos", () => {
  it("pago parcial no marca 'paid'; al completar el total sí", async () => {
    const res = await createIncome({
      clientId: ownerId,
      concept: "Honorarios",
      amount: 1000,
      taxRatePercent: 0,
      issueDate: `${year}-01-01`,
    });
    const { invoice } = (await res.json()) as { invoice: InvoiceJson };
    expect(invoice.totalCents).toBe(100_000);

    const partial = await app.request(`/tenant/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "x-tenant-slug": slug(), cookie, "content-type": "application/json" },
      body: JSON.stringify({ amount: 400 }),
    });
    expect(partial.status).toBe(201);
    const { invoice: afterPartial } = (await partial.json()) as { invoice: InvoiceJson };
    expect(afterPartial.status).toBe("pending");
    expect(afterPartial.paidCents).toBe(40_000);

    const rest = await app.request(`/tenant/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "x-tenant-slug": slug(), cookie, "content-type": "application/json" },
      body: JSON.stringify({ amount: 600, method: "cash" }),
    });
    const { invoice: afterFull } = (await rest.json()) as { invoice: InvoiceJson };
    expect(afterFull.status).toBe("paid");
    expect(afterFull.paidCents).toBe(100_000);
  });

  it("no se puede pagar una factura cancelada (400); factura inexistente → 404", async () => {
    const res = await createIncome({
      clientId: ownerId,
      concept: "Honorarios",
      amount: 200,
      issueDate: `${year}-01-01`,
    });
    const { invoice } = (await res.json()) as { invoice: InvoiceJson };
    await app.request(`/tenant/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "x-tenant-slug": slug(), cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    const pay = await app.request(`/tenant/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "x-tenant-slug": slug(), cookie, "content-type": "application/json" },
      body: JSON.stringify({ amount: 50 }),
    });
    expect(pay.status).toBe(400);

    const missing = await app.request(`/tenant/invoices/00000000-0000-0000-0000-000000000000/payments`, {
      method: "POST",
      headers: { "x-tenant-slug": slug(), cookie, "content-type": "application/json" },
      body: JSON.stringify({ amount: 50 }),
    });
    expect(missing.status).toBe(404);
  });
});

describe("Listado, filtros y aislamiento", () => {
  it("filtra por direction y status; una factura de A no aparece para B", async () => {
    await createExpense({ category: "water", amount: "10", issueDate: `${year}-01-01` });
    await createIncome({ clientId: ownerId, concept: "x", amount: 50, issueDate: `${year}-01-01` });

    const onlyIncome = await app.request("/tenant/invoices?direction=income", {
      headers: { "x-tenant-slug": slug(), cookie },
    });
    const { invoices: incomeList } = (await onlyIncome.json()) as { invoices: InvoiceJson[] };
    expect(incomeList).toHaveLength(1);

    // aislamiento: nada de lo creado para A aparece bajo el tenant B
    const rowsB = await db.select().from(invoicesTable).where(eq(invoicesTable.tenantId, tenantB.id));
    expect(rowsB).toHaveLength(0);
  });
});

describe("PDF de facturas emitidas", () => {
  it("genera un PDF para una factura income", async () => {
    const created = await createIncome({
      clientId: ownerId,
      propertyId: propId,
      concept: "Honorarios de gestión",
      amount: 500,
      taxRatePercent: 21,
      issueDate: `${year}-01-01`,
    });
    const { invoice } = (await created.json()) as { invoice: InvoiceJson };

    const res = await app.request(`/tenant/invoices/${invoice.id}/pdf`, {
      headers: { "x-tenant-slug": slug(), cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("rechaza el PDF de una factura de gasto (expense)", async () => {
    const created = await createExpense({ category: "water", amount: "10", issueDate: `${year}-01-01` });
    const { invoice } = (await created.json()) as { invoice: InvoiceJson };

    const res = await app.request(`/tenant/invoices/${invoice.id}/pdf`, {
      headers: { "x-tenant-slug": slug(), cookie },
    });
    expect(res.status).toBe(400);
  });

  it("404 si la factura no existe", async () => {
    const res = await app.request(
      `/tenant/invoices/00000000-0000-0000-0000-000000000000/pdf`,
      { headers: { "x-tenant-slug": slug(), cookie } },
    );
    expect(res.status).toBe(404);
  });

  it("aislamiento: el PDF de una factura de A no es accesible desde B", async () => {
    const created = await createIncome({
      clientId: ownerId,
      concept: "x",
      amount: 50,
      issueDate: `${year}-01-01`,
    });
    const { invoice } = (await created.json()) as { invoice: InvoiceJson };

    const res = await app.request(`/tenant/invoices/${invoice.id}/pdf`, {
      headers: { "x-tenant-slug": SLUGS[1]!, cookie },
    });
    expect(res.status).toBe(403);
  });
});

describe("Portal del propietario", () => {
  it("muestra los gastos del año, con factura descargable, sumados en euros→céntimos", async () => {
    await createExpense(
      { propertyId: propId, category: "derrama", amount: "350", issueDate: `${year}-03-01`, concept: "Derrama ascensor" },
      { name: "derrama.pdf", type: "application/pdf" },
    );
    await createExpense({ propertyId: propId, category: "water", amount: "25.50", issueDate: `${year}-04-01` });

    const tokenRes = await app.request(`/tenant/portal/clients/${ownerId}/token`, {
      method: "POST",
      headers: { "x-tenant-slug": slug(), cookie },
    });
    const { token } = (await tokenRes.json()) as { token: string };
    const portal = await app.request(`/tenant/portal/${token}`, { headers: { "x-tenant-slug": slug() } });
    const data = (await portal.json()) as {
      properties: Array<{
        expensesThisYearCents: number;
        latestExpenses: Array<{ category: string; fileUrl: string | null }>;
      }>;
    };
    expect(data.properties[0]!.expensesThisYearCents).toBe(37_550); // 350 + 25,50
    expect(data.properties[0]!.latestExpenses).toHaveLength(2);
    expect(data.properties[0]!.latestExpenses.find((e) => e.category === "derrama")!.fileUrl).toBeTruthy();
  });
});
