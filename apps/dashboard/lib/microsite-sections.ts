import type { SiteConfig, SiteSection, SiteSectionType } from "./api";

// ============================================================================
// Metadatos de EDICIÓN de las secciones del micrositio (gestor del dashboard).
//
// Espejo editor del registro de render de tenant-site (sections.tsx). Aquí solo
// vive lo que el editor necesita: etiqueta, descripción, si exige módulo, y los
// CAMPOS editables (data-driven → el editor pinta los inputs genéricamente).
// Añadir una sección nueva = una entrada aquí + su Body en tenant-site.
// ============================================================================

export type SectionFieldType = "text" | "textarea" | "select";
export type SectionField = {
  key: string;
  label: string;
  type: SectionFieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
};
export type SectionTypeMeta = {
  type: SiteSectionType;
  label: string;
  description: string;
  /** Requiere este módulo contratado para poder añadirse. */
  moduleGate?: string;
  fields: SectionField[];
};

export const SECTION_TYPE_METAS: SectionTypeMeta[] = [
  {
    type: "hero",
    label: "Portada",
    description: "La cabecera de tu web: titular, subtítulo y foto destacada.",
    fields: [
      {
        key: "template",
        label: "Plantilla",
        type: "select",
        options: [
          { value: "editorial", label: "Editorial — texto + foto destacada" },
          { value: "minimal", label: "Minimal — centrado, solo texto" },
          { value: "bold", label: "Bold — foto a pantalla completa" },
        ],
      },
      { key: "eyebrow", label: "Antetítulo", type: "text", placeholder: "Inmobiliaria en Bilbao" },
      { key: "title", label: "Titular", type: "text", placeholder: "Tu próximo hogar, verificado." },
      {
        key: "subtitle",
        label: "Subtítulo",
        type: "textarea",
        placeholder: "Una frase que explique qué os hace diferentes.",
      },
    ],
  },
  {
    type: "properties",
    label: "Propiedades",
    description: "La rejilla con tus inmuebles publicados, en tiempo real.",
    fields: [
      { key: "eyebrow", label: "Antetítulo", type: "text", placeholder: "En venta y alquiler" },
      { key: "title", label: "Título", type: "text", placeholder: "Propiedades" },
    ],
  },
  {
    type: "valuation",
    label: "Valoración",
    description: "Widget «Valora tu piso gratis» que capta propietarios como leads.",
    moduleGate: "valuation",
    fields: [
      { key: "eyebrow", label: "Antetítulo", type: "text", placeholder: "¿Vendes tu piso?" },
      { key: "title", label: "Título", type: "text", placeholder: "Valora tu piso gratis." },
      {
        key: "intro",
        label: "Texto introductorio",
        type: "textarea",
        placeholder: "Explica en una o dos frases cómo funciona la valoración.",
      },
    ],
  },
];

export const SECTION_META_BY_TYPE: Record<SiteSectionType, SectionTypeMeta> =
  Object.fromEntries(SECTION_TYPE_METAS.map((m) => [m.type, m])) as Record<
    SiteSectionType,
    SectionTypeMeta
  >;

/**
 * Lista de secciones para el EDITOR. Si el tenant ya tiene `sections`
 * persistidas, mandan tal cual. Si no, se derivan de los campos planos (misma
 * lógica retrocompatible que el render), filtradas por módulo: una sección de
 * pago que el tenant no tiene NO aparece (coherente con "nunca mostrar estado
 * de módulo" — simplemente no existe para él hasta contratarla).
 */
export function deriveEditorSections(
  config: SiteConfig,
  hasModule: (code: string) => boolean,
): SiteSection[] {
  if (config.sections && config.sections.length > 0) return config.sections;
  const base: SiteSection[] = [
    {
      id: "hero",
      type: "hero",
      enabled: true,
      template: config.template,
      eyebrow: config.heroEyebrow,
      title: config.heroTitle,
      subtitle: config.heroSubtitle,
    },
    { id: "properties", type: "properties", enabled: true },
    { id: "valuation", type: "valuation", enabled: true },
  ];
  return base.filter((s) => {
    const gate = SECTION_META_BY_TYPE[s.type].moduleGate;
    return !gate || hasModule(gate);
  });
}

/** Crea una sección nueva del tipo dado con su contenido vacío (id = type:
 *  invariante actual de una-sección-por-tipo; si Paso 3+ permite varias del
 *  mismo tipo, cambiar a crypto.randomUUID()). */
export function newSection(type: SiteSectionType): SiteSection {
  return { id: type, type, enabled: true } as SiteSection;
}
