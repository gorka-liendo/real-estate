import { z } from "zod";

// Lead entrante del micrositio (POST público). El honeypot `company` va aparte:
// no lo validamos estricto para poder responder 204 (fingir éxito) si un bot lo
// rellena, en vez de un 400 que delataría el campo trampa.
export const createLeadSchema = z
  .object({
    name: z.string().min(1, "El nombre es obligatorio").max(200),
    email: z.email().optional().or(z.literal("")).transform((v) => v || undefined),
    phone: z.string().max(40).optional(),
    message: z.string().max(1000).optional(),
    propertyId: z.uuid().optional(),
    company: z.string().max(200).optional(), // honeypot: debe venir vacío
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: "Hace falta un email o un teléfono de contacto",
    path: ["email"],
  });

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
