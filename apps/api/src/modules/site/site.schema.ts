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

// URL de media servida por NOSOTROS (@rep/storage): relativa (/uploads/…) o
// absoluta (R2). Bloquea esquemas ejecutables (javascript:, data:) porque se
// inyecta como src / background-image.
const mediaUrl = z
  .string()
  .max(500)
  .refine((u) => /^(\/|https?:\/\/)/i.test(u), { message: "url_must_be_safe" });

// Secciones del cuerpo del micrositio (motor de secciones). Unión discriminada
// por `type` — espejo de validación de `SiteSection` de @rep/db. Cada tipo valida
// solo su propio contenido; añadir un tipo = añadir un miembro aquí.
const sectionBase = {
  id: z.string().min(1).max(64),
  enabled: z.boolean(),
  navLabel: z.string().max(40).optional(),
};
const heroSection = z.object({
  ...sectionBase,
  type: z.literal("hero"),
  template: z.enum(["editorial", "minimal", "bold"]).optional(),
  eyebrow: z.string().max(80).optional(),
  title: z.string().max(120).optional(),
  subtitle: z.string().max(400).optional(),
  backgroundImageUrl: mediaUrl.optional(),
  backgroundVideoUrl: mediaUrl.optional(),
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
const statsSection = z.object({
  ...sectionBase,
  type: z.literal("stats"),
  eyebrow: z.string().max(80).optional(),
  title: z.string().max(120).optional(),
  items: z
    .array(z.object({ value: z.string().max(20), label: z.string().max(60) }))
    .max(8)
    .optional(),
});
const testimonialsSection = z.object({
  ...sectionBase,
  type: z.literal("testimonials"),
  eyebrow: z.string().max(80).optional(),
  title: z.string().max(120).optional(),
  items: z
    .array(
      z.object({
        quote: z.string().max(400),
        author: z.string().max(80),
        role: z.string().max(80).optional(),
      }),
    )
    .max(12)
    .optional(),
});
const faqSection = z.object({
  ...sectionBase,
  type: z.literal("faq"),
  eyebrow: z.string().max(80).optional(),
  title: z.string().max(120).optional(),
  items: z
    .array(z.object({ question: z.string().max(200), answer: z.string().max(800) }))
    .max(20)
    .optional(),
});
const splitSection = z.object({
  ...sectionBase,
  type: z.literal("split"),
  eyebrow: z.string().max(80).optional(),
  title: z.string().max(120).optional(),
  body: z.string().max(1200).optional(),
  imageUrl: mediaUrl.optional(),
});
const siteSection = z.discriminatedUnion("type", [
  heroSection,
  propertiesSection,
  valuationSection,
  statsSection,
  testimonialsSection,
  faqSection,
  splitSection,
]);

// Contenido del micrositio (site_config). Todo opcional: el editor manda el objeto
// completo y los vacíos caen a los defaults de la plantilla.
export const siteConfigSchema = z.object({
  headerStyle: z.enum(["floating", "solid"]).optional(),
  headerBrand: z.enum(["logo", "text"]).optional(),
  logoScale: z.number().min(0.5).max(3).optional(),
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
