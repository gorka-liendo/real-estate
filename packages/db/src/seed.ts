import { db } from "./client.js";
import { modules, subscriptions, tenants } from "./schema/index.js";

// Seed idempotente: upsert por slug/email/code — ejecutable N veces sin efectos secundarios.
async function main() {
  // --- catálogo de módulos (secciones funcionales del dashboard) ---
  const moduleCatalog = [
    { code: "clients", name: "Clientes (CRM)", priceMonthly: 3900 },
    { code: "properties", name: "Propiedades", priceMonthly: 3900 },
    { code: "accounting", name: "Contabilidad", priceMonthly: 4900 },
    { code: "whatsapp_bot", name: "Chatbot WhatsApp", priceMonthly: 7900 },
    { code: "microsite", name: "Micrositio white-label", priceMonthly: 4900 },
  ];

  const seededModules = [];
  for (const m of moduleCatalog) {
    const [row] = await db
      .insert(modules)
      .values(m)
      .onConflictDoUpdate({
        target: modules.code,
        set: { name: m.name, priceMonthly: m.priceMonthly },
      })
      .returning();
    seededModules.push(row!);
  }

  // --- tenants de prueba con brand_config distinto (para validar white-label) ---
  const tenantSeeds = [
    {
      slug: "martinez",
      name: "Inmobiliaria Martínez",
      brandConfig: {
        primaryColor: "#1e3a8a",
        borderRadius: 8 as const,
        micrositeStyle: "minimal" as const,
      },
    },
    {
      slug: "lopez",
      name: "Agencia López",
      // sin brandConfig → defaults Dwell (Capa 1)
      brandConfig: {},
    },
  ];

  const seededTenants = [];
  for (const t of tenantSeeds) {
    const [row] = await db
      .insert(tenants)
      .values(t)
      .onConflictDoUpdate({
        target: tenants.slug,
        set: { name: t.name, brandConfig: t.brandConfig },
      })
      .returning();
    seededTenants.push(row!);
  }

  // (los usuarios owner + memberships los crea el seed de @rep/auth,
  //  que usa el hash de password de Better-Auth)

  // --- martinez con Clientes + Micrositio activos; lopez sin módulos ---
  const martinez = seededTenants.find((t) => t!.slug === "martinez")!;
  const activeForMartinez = ["clients", "microsite"];
  for (const code of activeForMartinez) {
    const mod = seededModules.find((m) => m!.code === code)!;
    await db
      .insert(subscriptions)
      .values({ tenantId: martinez.id, moduleId: mod.id, active: true, activatedAt: new Date() })
      .onConflictDoUpdate({
        target: [subscriptions.tenantId, subscriptions.moduleId],
        set: { active: true },
      });
  }

  console.log(
    `✅ Seed: ${seededModules.length} módulos, ${seededTenants.length} tenants (martinez con Clientes + Micrositio)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed falló:", err);
    process.exit(1);
  });
