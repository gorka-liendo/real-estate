import type { CSSProperties } from "react";
import type { BrandConfig } from "@rep/db";

export type { BrandConfig } from "@rep/db";

// --- helpers de color (guardarraíles de accesibilidad para el white-label total) ---

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Devuelve texto legible (casi negro / casi blanco) sobre un fondo dado. */
function readableOn(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? "#0a0a0a" : "#fbfbfb";
}

function mix(hex: string, withHex: string, ratio: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(withHex);
  if (!a || !b) return hex;
  const c = a.map((v, i) => Math.round(v * (1 - ratio) + b![i]! * ratio));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Traduce el brand_config de la inmobiliaria a variables --ui-* del dashboard
 * (white-label TOTAL). Los guardarraíles evitan que un color de marca rompa la
 * legibilidad: el texto sobre `primary` se calcula por contraste, y si el fondo
 * es oscuro se derivan superficie/borde/tinta coherentes.
 */
export function brandConfigToUiVars(brand: BrandConfig | null | undefined): CSSProperties {
  const vars: Record<string, string> = {};
  if (!brand) return vars as CSSProperties;

  if (brand.primaryColor) {
    vars["--ui-primary"] = brand.primaryColor;
    vars["--ui-primary-hover"] = mix(brand.primaryColor, readableOn(brand.primaryColor), 0.14);
    vars["--ui-on-primary"] = readableOn(brand.primaryColor);
    vars["--ui-ring"] = `${brand.primaryColor}47`; // ~28% alpha
  }
  if (brand.accentColor) {
    vars["--ui-success"] = brand.accentColor; // acento del cliente para estados "on"
  }
  if (brand.textPrimary) vars["--ui-text"] = brand.textPrimary;
  if (brand.textSecondary) vars["--ui-muted"] = brand.textSecondary;
  if (brand.fontDisplay) vars["--ui-font-display"] = `"${brand.fontDisplay}", sans-serif`;
  if (brand.fontBody) vars["--ui-font-body"] = `"${brand.fontBody}", sans-serif`;
  if (brand.borderRadius !== undefined) {
    const r = brand.borderRadius;
    vars["--ui-radius"] = `${r}px`;
    // 0 se mantiene 0 (esquina recta Dwell); >0 escala para jerarquía visual
    vars["--ui-radius-lg"] = `${r === 0 ? 0 : r + 4}px`;
    vars["--ui-radius-sm"] = `${Math.max(0, r - 2)}px`;
    vars["--ui-radius-btn"] = `${r}px`; // por defecto sigue al general
  }
  if (brand.buttonRadius !== undefined) {
    vars["--ui-radius-btn"] = `${brand.buttonRadius}px`; // Dwell: 999 (píldora)
  }

  // fondo: si es oscuro, derivamos superficie/borde/tinta para no romper contraste
  if (brand.background) {
    vars["--ui-bg"] = brand.background;
    const dark = relativeLuminance(brand.background) < 0.35;
    if (dark) {
      vars["--ui-surface"] = mix(brand.background, "#ffffff", 0.06);
      vars["--ui-border"] = "rgba(255,255,255,0.12)";
      vars["--ui-border-strong"] = "rgba(255,255,255,0.24)";
      vars["--ui-hover"] = "rgba(255,255,255,0.06)";
      vars["--ui-active"] = "rgba(255,255,255,0.1)";
      if (!brand.textPrimary) vars["--ui-text"] = "#f5f5f5";
      if (!brand.textSecondary) vars["--ui-muted"] = "rgba(245,245,245,0.6)";
    }
  }

  return vars as CSSProperties;
}
