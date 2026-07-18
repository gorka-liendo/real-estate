import { tenantSiteEnv } from "@rep/config/tenant-site";
import type { BrandConfig, ValuationEstimate } from "@rep/ui-tenant";

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
  footerAddress?: string;
  footerSchedule?: string;
};

export type TenantData = {
  slug: string;
  name: string;
  brandConfig: BrandConfig;
  siteConfig: SiteConfig;
};

// ISR: en producción la ficha se regenera como mucho cada 60 s. En desarrollo
// usamos 0 (sin caché) para que los cambios de datos se vean al instante y no
// parezca que "no hay hot reload".
const REVALIDATE_SECONDS = process.env.NODE_ENV === "production" ? 60 : 0;

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

export type PropertyCondition = "new" | "good" | "renew";
export type PropertyDetails = {
  reference?: string;
  subtype?: string;
  condition?: PropertyCondition;
  floor?: string;
  exterior?: boolean;
  furnished?: boolean;
  equippedKitchen?: boolean;
  energyCert?: string;
  yearBuilt?: number;
  usableM2?: number;
  province?: string;
  neighborhood?: string;
  latitude?: number;
  longitude?: number;
};
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
  videos: string[];
  features: string[];
  details: PropertyDetails;
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

/**
 * Códigos de módulos activos del tenant (para gatear secciones del micrositio).
 * LANZA en error (no devuelve []): confundir "API caída" con "módulo no
 * contratado" haría que ISR cacheara la página SIN la sección gateada para un
 * tenant que la paga. Al lanzar, la revalidación falla y Next conserva la
 * última página buena (mismo criterio que fetchTenant).
 */
export async function fetchModules(slug: string): Promise<string[]> {
  const res = await fetch(`${tenantSiteEnv.NEXT_PUBLIC_API_URL}/tenant/modules`, {
    headers: { "x-tenant-slug": slug },
    next: { revalidate: REVALIDATE_SECONDS, tags: [`modules:${slug}`] },
  });
  if (!res.ok) throw new Error(`API ${res.status} al cargar módulos de '${slug}'`);
  return ((await res.json()) as { modules: string[] }).modules;
}

export type LeadPayload = {
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  propertyId?: string;
  company?: string; // honeypot
};

/**
 * Envía un lead de captación al API (endpoint público gateado por 'microsite').
 * Lanza si la respuesta no es OK para que el formulario muestre el estado de error.
 */
export async function submitLead(slug: string, payload: LeadPayload): Promise<void> {
  const res = await fetch(`${tenantSiteEnv.NEXT_PUBLIC_API_URL}/tenant/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tenant-slug": slug },
    body: JSON.stringify(payload),
  });
  if (res.status === 429) throw new Error("rate_limited"); // el form muestra copy específica
  if (!res.ok) throw new Error(`lead_submit_failed_${res.status}`);
}

export type ValuationPayload = {
  name: string;
  email?: string;
  phone?: string;
  kind: string;
  areaM2: number;
  city?: string;
  bedrooms?: number;
  company?: string; // honeypot
};

// Reusa la forma del DS (fuente única): el valor fluye directo al ValuationForm.
export type ValuationEstimateResult = ValuationEstimate | null;

/**
 * Envía una solicitud de valoración (widget "Valora tu piso gratis").
 * Devuelve la estimación calculada por la API (o null si no hay comparables).
 */
export async function submitValuation(
  slug: string,
  payload: ValuationPayload,
): Promise<ValuationEstimateResult> {
  const res = await fetch(`${tenantSiteEnv.NEXT_PUBLIC_API_URL}/tenant/valuations`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tenant-slug": slug },
    body: JSON.stringify(payload),
  });
  if (res.status === 204) return null; // honeypot: fingimos éxito sin datos
  if (res.status === 429) throw new Error("rate_limited"); // el form muestra copy específica
  if (!res.ok) throw new Error(`valuation_submit_failed_${res.status}`);
  return ((await res.json()) as { estimate: ValuationEstimateResult }).estimate;
}

export type VisitRequestPayload = {
  propertyId: string;
  name: string;
  email?: string;
  phone?: string;
  scheduledAt: string; // ISO
  company?: string; // honeypot
};

/** Solicita una visita a un inmueble (público, gateado por el módulo 'visits'). */
export async function submitVisitRequest(
  slug: string,
  payload: VisitRequestPayload,
): Promise<void> {
  const res = await fetch(`${tenantSiteEnv.NEXT_PUBLIC_API_URL}/tenant/visits/request`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tenant-slug": slug },
    body: JSON.stringify(payload),
  });
  if (res.status === 429) throw new Error("rate_limited"); // el form muestra copy específica
  if (res.status === 204) return; // honeypot: fingimos éxito
  if (!res.ok) throw new Error(`visit_request_failed_${res.status}`);
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
