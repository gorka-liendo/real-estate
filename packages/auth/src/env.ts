import { z } from "zod";

// Carga el .env local del package si existe (dev). En CI/producción las vars
// llegan puestas en el entorno del proceso (api/workers).
try {
  process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
} catch {
  // sin .env local — se usa el entorno tal cual
}

const parsed = z
  .object({
    BETTER_AUTH_SECRET: z.string().min(32, "mínimo 32 caracteres"),
    BETTER_AUTH_URL: z.url().default("http://localhost:3002"),
    // orígenes del dashboard y tenant-site para cookies cross-origin en dev
    TRUSTED_ORIGINS: z
      .string()
      .default("http://localhost:3000,http://localhost:3001")
      .transform((s) => s.split(",").map((o) => o.trim())),
  })
  .safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  console.error(`❌ Env de @rep/auth inválida:\n${issues.join("\n")}`);
  process.exit(1);
}

export const authEnv = parsed.data;
