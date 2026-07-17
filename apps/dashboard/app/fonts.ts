import localFont from "next/font/local";

// Carga de fuentes con next/font (forma oficial de Next): self-hosted, hashes
// estables, format("woff2") estándar, precarga y font-display correctos.
// Expone las variables CSS que consume el design system (@rep/ui).
// Archivo = display (stand-in de Acid Grotesk) · Hanken = body (stand-in Neue Montreal).

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
