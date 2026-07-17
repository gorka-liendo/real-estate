// Registro de temas disponibles (design systems). Mantener sincronizado con los
// archivos themes/<id>.css de @rep/ui Y @rep/ui-tenant (un id = un diseño en ambas
// superficies). Al añadir un tema a medida, registrarlo aquí.
export type ThemeInfo = { id: string; label: string; description: string };

export const THEMES: ThemeInfo[] = [
  { id: "dwell", label: "Dwell", description: "Editorial sobrio · negro, esquinas rectas, botón píldora" },
  { id: "costa", label: "Costa", description: "Azul frío, esquinas redondeadas" },
];

export const THEME_IDS = THEMES.map((t) => t.id);
