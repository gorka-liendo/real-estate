import type { Metadata } from "next";
// Design system white-label (tokens Dwell). Fuentes vía next/font (fonts.ts).
import "@rep/ui-tenant/styles.css";
import { fontBody, fontDisplay } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Real Estate Platform",
  description: "Micrositios de inmobiliarias",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${fontDisplay.variable} ${fontBody.variable}`}>
      <body>{children}</body>
    </html>
  );
}
