import { tenantSiteEnv } from "@rep/config/tenant-site";
import type { BrandConfig } from "@rep/ui-tenant";

export type SocialLink = { label: string; url: string };
export type SiteConfig = {
  template?: "editorial" | "minimal" | "bold";
  heroEyebrow?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  about?: string;
  contactEmail?: string;
  contactPhone?: string;
  social?: SocialLink[];
};

export type TenantData = {
  id: string;
  slug: string;
  name: string;
  brandConfig: BrandConfig;
  siteConfig: SiteConfig;
};

const REVALIDATE_SECONDS = 60; // ISR: la ficha se regenera cuando cambia el tenant

/**
 * Carga los datos públicos de un tenant desde la API por su slug.
 * Con ISR (revalidate) el SEO es impecable y el coste casi cero.
 */
export async function fetchTenant(slug: string): Promise<TenantData | null> {
  const res = await fetch(`${tenantSiteEnv.NEXT_PUBLIC_API_URL}/tenant`, {
    headers: { "x-tenant-slug": slug },
    next: { revalidate: REVALIDATE_SECONDS, tags: [`tenant:${slug}`] },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} al cargar tenant '${slug}'`);
  return (await res.json()) as TenantData;
}

export type PublicProperty = {
  id: string;
  title: string;
  description: string | null;
  operation: "sale" | "rent";
  kind: "flat" | "house" | "commercial" | "land" | "garage";
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  city: string | null;
  address: string | null;
  photos: string[];
};

/** Propiedades publicadas del tenant (para el micrositio). Vacío si no aplica. */
export async function fetchListings(slug: string): Promise<PublicProperty[]> {
  const res = await fetch(`${tenantSiteEnv.NEXT_PUBLIC_API_URL}/tenant/listings`, {
    headers: { "x-tenant-slug": slug },
    next: { revalidate: REVALIDATE_SECONDS, tags: [`listings:${slug}`] },
  });
  if (!res.ok) return [];
  return ((await res.json()) as { properties: PublicProperty[] }).properties;
}

/** Ficha de una propiedad publicada por id. */
export async function fetchProperty(
  slug: string,
  id: string,
): Promise<PublicProperty | null> {
  const res = await fetch(`${tenantSiteEnv.NEXT_PUBLIC_API_URL}/tenant/listings/${id}`, {
    headers: { "x-tenant-slug": slug },
    next: { revalidate: REVALIDATE_SECONDS, tags: [`listings:${slug}`] },
  });
  if (!res.ok) return null;
  return ((await res.json()) as { property: PublicProperty }).property;
}
