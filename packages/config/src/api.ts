import { z } from "zod";
import { createEnv } from "./create-env.js";

export const apiEnv = createEnv(
  z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3002),
    // Se añadirán aquí conforme avancen las fases:
    // DATABASE_URL (Fase B) · BETTER_AUTH_SECRET (Fase B)
    // STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (Fase C)
    // REDIS_URL, R2_*, RESEND_API_KEY (Fase E)
  }),
);
