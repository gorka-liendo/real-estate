import type { CSSProperties } from "react";
import type { BrandConfig } from "@rep/db";

export type { BrandConfig } from "@rep/db";

// Mapa brand_config → variable CSS. Solo las claves presentes se emiten;
// lo ausente cae al default Dwell definido en tokens.css (Capa 1).
const CSS_VAR_BY_FIELD: Record<keyof BrandConfig, string | null> = {
  primaryColor: "--tenant-primary",
  secondaryColor: "--tenant-secondary",
  accentColor: "--tenant-accent",
  background: "--tenant-bg",
  textPrimary: "--tenant-text",
  textSecondary: "--tenant-muted",
  fontDisplay: "--tenant-font-display",
  fontBody: "--tenant-font-body",
  borderRadius: "--tenant-radius", // number → px
  // no son variables CSS:
  logoUrl: null,
  faviconUrl: null,
  micrositeStyle: null,
};

/**
 * Convierte el brand_config en un diccionario de variables CSS (Capa 2).
 * Se aplica como `style` en el contenedor raíz del micrositio → sobreescribe
 * los defaults Dwell en runtime, sin recompilar (un solo build, N inmobiliarias).
 */
export function brandConfigToCssVars(brand: BrandConfig | null | undefined): CSSProperties {
  const vars: Record<string, string> = {};
  if (!brand) return vars as CSSProperties;

  for (const [field, cssVar] of Object.entries(CSS_VAR_BY_FIELD)) {
    if (!cssVar) continue;
    const value = brand[field as keyof BrandConfig];
    if (value === undefined || value === null) continue;
    vars[cssVar] = field === "borderRadius" ? `${value}px` : String(value);
  }
  return vars as CSSProperties;
}

/** Serializa el brand_config como texto CSS para inyectar en un <style> (SSR/ISR). */
export function brandConfigToStyleString(
  brand: BrandConfig | null | undefined,
  selector = ":root",
): string {
  const vars = brandConfigToCssVars(brand) as Record<string, string>;
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return body ? `${selector} {\n${body}\n}` : "";
}
