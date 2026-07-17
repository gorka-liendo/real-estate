import type { BrandConfig } from "@rep/ui";
import { API_URL } from "./config";

// Cliente de la API. Todas las peticiones llevan credentials:'include' para que
// la cookie httpOnly de sesión (Better-Auth) viaje al backend. No se guarda
// ningún token en JS/localStorage — la sesión vive solo en la cookie httpOnly.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type Membership = { slug: string; name: string; role: "owner" | "agent" | "viewer" };
export type Me = {
  user: { id: string; email: string; name: string };
  memberships: Membership[];
  isPlatformAdmin: boolean;
};

export type ClientStage = "lead" | "active" | "closed";
export type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: ClientStage;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ClientInput = {
  name: string;
  email?: string;
  phone?: string;
  stage?: ClientStage;
  notes?: string;
};

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

export type PropertyOperation = "sale" | "rent";
export type PropertyKind = "flat" | "house" | "commercial" | "land" | "garage";
export type PropertyStatus = "draft" | "published" | "archived";
export type Property = {
  id: string;
  title: string;
  description: string | null;
  operation: PropertyOperation;
  kind: PropertyKind;
  status: PropertyStatus;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  city: string | null;
  address: string | null;
  photos: string[];
  createdAt: string;
  updatedAt: string;
};
export type PropertyInput = {
  title: string;
  operation?: PropertyOperation;
  kind?: PropertyKind;
  status?: PropertyStatus;
  price?: number;
  city?: string;
  areaM2?: number;
  bedrooms?: number;
  bathrooms?: number;
  description?: string;
  address?: string;
};

export type CatalogModule = {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
};
export type AdminTenant = {
  id: string;
  slug: string;
  name: string;
  status: string;
  customDomain: string | null;
  activeModules: string[];
};

export const api = {
  me: () => request<Me>("/me"),

  signIn: (email: string, password: string) =>
    request<unknown>("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  signOut: () =>
    request<unknown>("/api/auth/sign-out", { method: "POST", body: "{}" }),

  tenantModules: (slug: string) =>
    request<{ modules: string[] }>("/tenant/modules", {
      headers: { "x-tenant-slug": slug },
    }),

  tenant: (slug: string) =>
    request<{ id: string; slug: string; name: string; brandConfig: BrandConfig }>("/tenant", {
      headers: { "x-tenant-slug": slug },
    }),

  // --- editor del micrositio (site_config) ---
  site: {
    get: (slug: string) =>
      request<{ siteConfig: SiteConfig }>("/tenant/site", {
        headers: { "x-tenant-slug": slug },
      }),
    update: (slug: string, data: SiteConfig) =>
      request<{ siteConfig: SiteConfig }>("/tenant/site", {
        method: "PATCH",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify(data),
      }),
  },

  // --- módulo Clientes (CRM) ---
  clients: {
    list: (slug: string) =>
      request<{ clients: Client[] }>("/tenant/clients", { headers: { "x-tenant-slug": slug } }),

    create: (slug: string, data: ClientInput) =>
      request<{ client: Client }>("/tenant/clients", {
        method: "POST",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify(data),
      }),

    update: (slug: string, id: string, data: Partial<ClientInput>) =>
      request<{ client: Client }>(`/tenant/clients/${id}`, {
        method: "PATCH",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify(data),
      }),

    remove: (slug: string, id: string) =>
      request<void>(`/tenant/clients/${id}`, {
        method: "DELETE",
        headers: { "x-tenant-slug": slug },
      }),
  },

  // --- módulo Propiedades ---
  properties: {
    list: (slug: string) =>
      request<{ properties: Property[] }>("/tenant/properties", {
        headers: { "x-tenant-slug": slug },
      }),

    create: (slug: string, data: PropertyInput) =>
      request<{ property: Property }>("/tenant/properties", {
        method: "POST",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify(data),
      }),

    update: (slug: string, id: string, data: Partial<PropertyInput>) =>
      request<{ property: Property }>(`/tenant/properties/${id}`, {
        method: "PATCH",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify(data),
      }),

    remove: (slug: string, id: string) =>
      request<void>(`/tenant/properties/${id}`, {
        method: "DELETE",
        headers: { "x-tenant-slug": slug },
      }),

    // subida multipart: sin content-type manual (el navegador pone el boundary)
    uploadPhoto: async (slug: string, id: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/tenant/properties/${id}/photos`, {
        method: "POST",
        credentials: "include",
        headers: { "x-tenant-slug": slug },
        body: fd,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(res.status, b.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as { property: Property };
    },

    removePhoto: (slug: string, id: string, url: string) =>
      request<{ property: Property }>(
        `/tenant/properties/${id}/photos?url=${encodeURIComponent(url)}`,
        { method: "DELETE", headers: { "x-tenant-slug": slug } },
      ),
  },

  // --- superadmin ---
  adminCatalog: () => request<{ modules: CatalogModule[] }>("/admin/catalog"),

  adminTenants: () => request<{ tenants: AdminTenant[] }>("/admin/tenants"),

  adminSetModule: (slug: string, code: string, active: boolean) =>
    request<{ tenant: string; module: string; active: boolean; activeModules: string[] }>(
      `/admin/tenants/${slug}/modules/${code}`,
      { method: "PUT", body: JSON.stringify({ active }) },
    ),
};
