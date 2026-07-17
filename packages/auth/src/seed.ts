import { eq } from "drizzle-orm";
import { closeDb, db, memberships, tenants, user } from "@rep/db";
import { auth } from "./index.js";

// Seed idempotente de usuarios owner (uno por tenant del seed de @rep/db).
// Usa la API de Better-Auth para que el password quede hasheado con scrypt.
// SEED_OWNER_PASSWORD viene del entorno — nunca hardcodeada.

const password = process.env.SEED_OWNER_PASSWORD;
if (!password) {
  console.error("❌ Falta SEED_OWNER_PASSWORD — ver packages/auth/.env.example");
  process.exit(1);
}

async function main() {
  const allTenants = await db.select().from(tenants);
  if (allTenants.length === 0) {
    console.error("❌ No hay tenants — ejecuta antes el seed de @rep/db (pnpm db:seed)");
    process.exit(1);
  }

  for (const tenant of allTenants) {
    const email = `owner@${tenant.slug}.example.com`;

    let [existing] = await db.select().from(user).where(eq(user.email, email));
    if (!existing) {
      await auth.api.signUpEmail({
        body: { email, password: password!, name: `Owner ${tenant.name}` },
      });
      [existing] = await db.select().from(user).where(eq(user.email, email));
    }

    await db
      .insert(memberships)
      .values({ userId: existing!.id, tenantId: tenant.id, role: "owner" })
      .onConflictDoNothing();

    console.log(`✅ owner listo: ${email} (tenant ${tenant.slug})`);
  }
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed de auth falló:", err);
    process.exit(1);
  });
