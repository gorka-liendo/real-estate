import { z } from "zod";

// Color hex (#rgb o #rrggbb) o vacío (= usar el default del sistema).
const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Color inválido")
  .or(z.literal(""))
  .optional();

export const brandConfigSchema = z.object({
  primaryColor: hex,
  secondaryColor: hex,
  accentColor: hex,
  background: hex,
  textPrimary: hex,
  textSecondary: hex,
  logoUrl: z.string().max(500).optional(),
  faviconUrl: z.string().max(500).optional(),
  fontDisplay: z.string().max(80).optional(),
  fontBody: z.string().max(80).optional(),
  borderRadius: z.coerce.number().int().min(0).max(32).optional(),
  buttonRadius: z.coerce.number().int().min(0).max(999).optional(),
  micrositeStyle: z.enum(["editorial", "minimal", "bold"]).optional(),
});

export type BrandConfigInput = z.infer<typeof brandConfigSchema>;
