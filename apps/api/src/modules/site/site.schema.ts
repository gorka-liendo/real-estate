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

// Secciones del cuerpo del micrositio (motor de secciones). Unión discriminada
// por `type` — espejo de validación de `SiteSection` de @rep/db. Cada tipo valida
// solo su propio contenido; añadir un tipo = añadir un miembro aquí.
const sectionBase = {
  id: z.string().min(1).max(64),
  enabled: z.boolean(),
};
const heroSection = z.object({
  ...sectionBase,
  type: z.literal("hero"),
  template: z.enum(["editorial", "minimal", "bold"]).optional(),
  eyebrow: z.string().max(80).optional(),
  title: z.string().max(120).optional(),
  subtitle: z.string().max(400).optional(),
});
const propertiesSection = z.object({
  ...sectionBase,
  type: z.literal("properties"),
  eyebrow: z.string().max(80).optional(),
  title: z.string().max(120).optional(),
});
const valuationSection = z.object({
  ...sectionBase,
  type: z.literal("valuation"),
  eyebrow: z.string().max(80).optional(),
  title: z.string().max(120).optional(),
  intro: z.string().max(400).optional(),
});
const siteSection = z.discriminatedUnion("type", [
  heroSection,
  propertiesSection,
  valuationSection,
]);

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
  // Motor de secciones: orden + activación del cuerpo del micrositio.
  sections: z.array(siteSection).max(30).optional(),
});

export type SiteConfigInput = z.infer<typeof siteConfigSchema>;
