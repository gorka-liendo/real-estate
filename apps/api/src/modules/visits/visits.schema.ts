import { z } from "zod";

// Solicitud pública de visita desde la ficha del micrositio.
export const requestVisitSchema = z
  .object({
    propertyId: z.uuid(),
    name: z.string().min(1, "El nombre es obligatorio").max(200),
    email: z.email().optional().or(z.literal("")).transform((v) => v || undefined),
    phone: z.string().max(40).optional(),
    scheduledAt: z.coerce.date(),
    company: z.string().max(200).optional(), // honeypot
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: "Hace falta un email o un teléfono de contacto",
    path: ["email"],
  })
  .refine((d) => d.scheduledAt.getTime() > Date.now(), {
    message: "La fecha debe ser futura",
    path: ["scheduledAt"],
  });

// Gestión privada desde la Agenda del dashboard.
export const updateVisitSchema = z.object({
  status: z.enum(["requested", "confirmed", "done", "cancelled"]).optional(),
  scheduledAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

export type RequestVisitInput = z.infer<typeof requestVisitSchema>;
export type UpdateVisitInput = z.infer<typeof updateVisitSchema>;
