import { z } from "zod";

// Driver por defecto: 'local' (filesystem) → funciona sin credenciales.
// En producción: STORAGE_DRIVER=r2 + las R2_* de Cloudflare.
const schema = z.object({
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),

  // --- local ---
  STORAGE_LOCAL_DIR: z.string().default(".uploads"),
  STORAGE_PUBLIC_URL: z.string().default("http://localhost:3002/uploads"),

  // --- r2 (solo si STORAGE_DRIVER=r2) ---
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
export const storageEnv = parsed.success ? parsed.data : schema.parse({});
