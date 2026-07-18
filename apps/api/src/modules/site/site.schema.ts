import { z } from "zod";

const socialLink = z.object({
  label: z.string().min(1).max(40),
  // Solo http(s): la url se renderiza como href en el micrositio; bloquea
  // esquemas ejecutables (javascript:, data:) para evitar self-XSS del tenant.
  url: z
    .string()
    .max(300)
    .refine((u) => /^https?:\/\//i.test(u), { message: "url_must_be_http" }),
});

// Contenido del micrositio (site_config). Todo opcional: el editor manda el objeto
// completo y los vacíos caen a los defaults de la plantilla.
export const siteConfigSchema = z.object({
  template: z.enum(["editorial", "minimal", "bold"]).optional(),
  heroEyebrow: z.string().max(80).optional(),
  heroTitle: z.string().max(120).optional(),
  heroSubtitle: z.string().max(400).optional(),
  about: z.string().max(1200).optional(),
  contactEmail: z.string().max(200).optional(),
  contactPhone: z.string().max(40).optional(),
  social: z.array(socialLink).max(8).optional(),
  // Footer: dirección física y horario de la oficina (texto plano).
  footerAddress: z.string().max(200).optional(),
  footerSchedule: z.string().max(120).optional(),
});

export type SiteConfigInput = z.infer<typeof siteConfigSchema>;
