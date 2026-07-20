import type { SiteConfig, SiteSection, SiteSectionType } from "./api";

// ============================================================================
// Metadatos de EDICIÓN de las secciones del micrositio (gestor del dashboard).
//
// Espejo editor del registro de render de tenant-site (sections.tsx). Aquí solo
// vive lo que el editor necesita: etiqueta, descripción, si exige módulo, y los
// CAMPOS editables (data-driven → el editor pinta los inputs genéricamente).
// Añadir una sección nueva = una entrada aquí + su Body en tenant-site.
// ============================================================================

// Campo escalar (text/textarea/select) o LISTA de sub-ítems repetibles
// (type "list"): cada ítem tiene sus propios sub-campos escalares. Con esto
// las secciones de contenido con varias entradas (Cifras, y más adelante
// Testimonios/FAQ/Servicios) se editan sin código a medida.
export type ScalarFieldType = "text" | "textarea" | "select";
export type ScalarField = {
  key: string;
  label: string;
  type: ScalarFieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
};
export type ListField = {
  key: string;
  label: string;
  type: "list";
  itemLabel: string; // singular, p.ej. "Cifra" → botón "Añadir Cifra"
  itemFields: ScalarField[];
  max?: number;
};
export type SectionField = ScalarField | ListField;
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
  {
    type: "stats",
    label: "Cifras",
    description: "Cifras clave que transmiten confianza (años, ventas, valoración…).",
    fields: [
      { key: "eyebrow", label: "Antetítulo", type: "text", placeholder: "Por qué elegirnos" },
      { key: "title", label: "Título", type: "text", placeholder: "En cifras" },
      {
        key: "items",
        label: "Cifras",
        type: "list",
        itemLabel: "Cifra",
        max: 8,
        itemFields: [
          { key: "value", label: "Valor", type: "text", placeholder: "+20" },
          { key: "label", label: "Etiqueta", type: "text", placeholder: "años de experiencia" },
        ],
      },
    ],
  },
  {
    type: "testimonials",
    label: "Opiniones",
    description: "Testimonios de clientes: prueba social que ayuda a convertir.",
    fields: [
      { key: "eyebrow", label: "Antetítulo", type: "text", placeholder: "Lo que dicen de nosotros" },
      { key: "title", label: "Título", type: "text", placeholder: "Opiniones de clientes" },
      {
        key: "items",
        label: "Testimonios",
        type: "list",
        itemLabel: "Testimonio",
        max: 12,
        itemFields: [
          {
            key: "quote",
            label: "Cita",
            type: "textarea",
            placeholder: "Nos ayudaron a vender en tres semanas.",
          },
          { key: "author", label: "Autor", type: "text", placeholder: "Ana G." },
          { key: "role", label: "Detalle (opcional)", type: "text", placeholder: "Vendió en Deusto" },
        ],
      },
    ],
  },
  {
    type: "faq",
    label: "Preguntas frecuentes",
    description: "Resuelve dudas comunes y reduce fricción antes de que te escriban.",
    fields: [
      { key: "eyebrow", label: "Antetítulo", type: "text", placeholder: "¿Dudas?" },
      { key: "title", label: "Título", type: "text", placeholder: "Preguntas frecuentes" },
      {
        key: "items",
        label: "Preguntas",
        type: "list",
        itemLabel: "Pregunta",
        max: 20,
        itemFields: [
          {
            key: "question",
            label: "Pregunta",
            type: "text",
            placeholder: "¿Cobráis por la valoración?",
          },
          {
            key: "answer",
            label: "Respuesta",
            type: "textarea",
            placeholder: "No, la valoración inicial es gratuita y sin compromiso.",
          },
        ],
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
