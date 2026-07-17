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
  return (await res.json()) as T;
}

export type Membership = { slug: string; name: string; role: "owner" | "agent" | "viewer" };
export type Me = {
  user: { id: string; email: string; name: string };
  memberships: Membership[];
  isPlatformAdmin: boolean;
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

  // --- superadmin ---
  adminCatalog: () => request<{ modules: CatalogModule[] }>("/admin/catalog"),

  adminTenants: () => request<{ tenants: AdminTenant[] }>("/admin/tenants"),

  adminSetModule: (slug: string, code: string, active: boolean) =>
    request<{ tenant: string; module: string; active: boolean; activeModules: string[] }>(
      `/admin/tenants/${slug}/modules/${code}`,
      { method: "PUT", body: JSON.stringify({ active }) },
    ),
};
