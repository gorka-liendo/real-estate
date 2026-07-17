import { z } from "zod";

// Driver por defecto: 'console' (loguea el email, no lo envía) → sin credenciales.
// En producción: EMAIL_DRIVER=resend + RESEND_API_KEY.
const schema = z.object({
  EMAIL_DRIVER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM: z.string().default("Real Estate Platform <onboarding@resend.dev>"),
  RESEND_API_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
export const emailEnv = parsed.success ? parsed.data : schema.parse({});
