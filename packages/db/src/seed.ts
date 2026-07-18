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
    // Producto 04 del catálogo (Captación): widget "Valora tu piso gratis".
    // La otra pata (whatsapp_bot) llegará con el alta en Meta.
    { code: "valuation", name: "Captación: valoración de pisos", priceMonthly: 2900 },
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
      // Design system DWELL: off-white / gris / negro, sin acento, esquinas rectas,
      // botones en píldora. Fuentes = defaults (Archivo + Hanken, los stand-in Dwell).
      brandConfig: {
        // theme = design system del micrositio (themes/dwell.css). El dashboard
        // aún se tiñe con estos tokens (brandConfigToUiVars); el micrositio con el tema.
        theme: "dwell",
        background: "#FBFBFB",
        textPrimary: "#000000",
        textSecondary: "#878787",
        primaryColor: "#000000",
        borderRadius: 0,
        buttonRadius: 999,
        micrositeStyle: "editorial" as const,
      },
      // Contenido pre-rellenado (modelo híbrido). El cliente lo editaría en Ajustes.
      siteConfig: {
        template: "editorial" as const,
        heroEyebrow: "Inmobiliaria en Bilbao",
        heroTitle: "Tu próximo hogar, verificado.",
        heroSubtitle:
          "En Inmobiliaria Martínez visitamos cada propiedad en persona antes de publicarla: fotografía real, precios claros y trato cercano.",
        about:
          "Somos una inmobiliaria de barrio con más de 20 años ayudando a familias a comprar, vender y alquilar en Bilbao.",
        contactEmail: "hola@martinez.example.com",
        contactPhone: "+34 944 00 00 00",
        social: [
          { label: "Instagram", url: "https://instagram.com" },
          { label: "WhatsApp", url: "https://wa.me/34944000000" },
        ],
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
        set: { name: t.name, brandConfig: t.brandConfig, siteConfig: t.siteConfig ?? {} },
      })
      .returning();
    seededTenants.push(row!);
  }

  // (los usuarios owner + memberships los crea el seed de @rep/auth,
  //  que usa el hash de password de Better-Auth)

  // --- martinez con Clientes + Micrositio activos; lopez sin módulos ---
  // Seed AUTORITATIVO: deja el estado exacto (activa los previstos, desactiva el resto).
  const martinez = seededTenants.find((t) => t!.slug === "martinez")!;
  const activeForMartinez = ["clients", "properties", "microsite", "valuation"];
  for (const mod of seededModules) {
    const shouldBeActive = activeForMartinez.includes(mod!.code);
    await db
      .insert(subscriptions)
      .values({
        tenantId: martinez.id,
        moduleId: mod!.id,
        active: shouldBeActive,
        activatedAt: shouldBeActive ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [subscriptions.tenantId, subscriptions.moduleId],
        set: { active: shouldBeActive, activatedAt: shouldBeActive ? new Date() : null },
      });
  }

  console.log(
    `✅ Seed: ${seededModules.length} módulos, ${seededTenants.length} tenants (martinez: ${activeForMartinez.join(" + ")})`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed falló:", err);
    process.exit(1);
  });
