import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fetchTenant } from "@/lib/tenant";

// Layout de todas las páginas de un tenant (micrositio, portal, liquidación…).
// Aquí fijamos el FAVICON de la inmobiliaria una sola vez: si tiene uno subido
// (`faviconUrl`) se usa; si no, cae al icono por defecto del navegador.
type Params = { params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenant: slug } = await params;
  const tenant = await fetchTenant(slug);
  const favicon = tenant?.brandConfig.faviconUrl;
  return favicon ? { icons: { icon: favicon } } : {};
}

export default function TenantLayout({ children }: { children: ReactNode }) {
  return children;
}
