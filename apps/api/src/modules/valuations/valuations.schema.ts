import { z } from "zod";

// Solicitud de valoración del widget "Valora tu piso gratis" (POST público).
// Mismo criterio que leads: honeypot `company` aparte y contacto obligatorio
// (email o teléfono) — el objetivo del widget es captar al propietario.
export const createValuationSchema = z
  .object({
    name: z.string().min(1, "El nombre es obligatorio").max(200),
    email: z.email().optional().or(z.literal("")).transform((v) => v || undefined),
    phone: z.string().max(40).optional(),
    kind: z.enum(["flat", "house", "commercial", "land", "garage"]).default("flat"),
    // Decimales permitidos: "85.5 m²" es un input real de propietarios.
    areaM2: z.coerce.number().positive().max(100_000),
    city: z.string().max(120).optional(),
    address: z.string().max(300).optional(),
    bedrooms: z.coerce.number().int().min(0).max(50).optional(),
    company: z.string().max(200).optional(), // honeypot: debe venir vacío
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: "Hace falta un email o un teléfono de contacto",
    path: ["email"],
  });

export type CreateValuationInput = z.infer<typeof createValuationSchema>;
