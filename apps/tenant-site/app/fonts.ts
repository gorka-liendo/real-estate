import localFont from "next/font/local";

// Carga de fuentes con next/font (self-hosted, format woff2 estándar, precarga).
// Expone las variables que consume el design system del micrositio (@rep/ui-tenant).
// Archivo = display (stand-in Acid Grotesk) · Hanken = body (stand-in Neue Montreal).

export const fontDisplay = localFont({
  src: "./fonts/archivo-var.woff2",
  variable: "--font-display",
  weight: "100 900",
  display: "swap",
  fallback: ["sans-serif"],
});

export const fontBody = localFont({
  src: "./fonts/hanken-var.woff2",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
  fallback: ["sans-serif"],
});
