import { z } from "zod";

// Carga el .env local del package si existe (dev). En CI/producción
// DATABASE_URL llega ya puesta en el entorno.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
} catch {
  // sin .env local — se usa el entorno tal cual
}

const parsed = z
  .object({ DATABASE_URL: z.string().startsWith("postgres") })
  .safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Falta DATABASE_URL (postgres://...) — ver packages/db/.env.example");
  process.exit(1);
}

export const databaseUrl = parsed.data.DATABASE_URL;
