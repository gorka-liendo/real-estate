import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fetchTenant } from "@/lib/tenant";

// Layout de todas las páginas de un tenant (micrositio, portal, liquidación…).
// Aquí fijamos el FAVICON de la inmobiliaria una sola vez: si tiene uno subido
// (`faviconUrl`) se usa; si no, cae al icono por defecto del navegador.
type Params = { params: Promise<{ tenant: string }> };

// Tipo MIME por extensión — algunos navegadores no pintan un SVG como favicon
// si no se lo decimos explícitamente.
const MIME: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  webp: "image/webp",
  ico: "image/x-icon",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenant: slug } = await params;
  const tenant = await fetchTenant(slug);
  const favicon = tenant?.brandConfig.faviconUrl;
  if (!favicon) return {};
  const ext = favicon.split(".").pop()?.toLowerCase() ?? "";
  const type = MIME[ext];
  return { icons: { icon: type ? { url: favicon, type } : favicon } };
}

export default function TenantLayout({ children }: { children: ReactNode }) {
  return children;
}
