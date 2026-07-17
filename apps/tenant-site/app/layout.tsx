import type { Metadata } from "next";
// Design system white-label (tokens Dwell + fuentes self-hosted Archivo + Hanken).
import "@rep/ui-tenant/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Real Estate Platform",
  description: "Micrositios de inmobiliarias",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
