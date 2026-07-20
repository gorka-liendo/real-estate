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
export type ClientSource = "manual" | "microsite" | "valuation";
export type ClientKind = "owner" | "renter" | "buyer" | "seeker" | "other";
export type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: ClientStage;
  source: ClientSource;
  kind: ClientKind;
  monthlyFeeCents: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ClientInput = {
  name: string;
  email?: string;
  phone?: string;
  stage?: ClientStage;
  kind?: ClientKind;
  monthlyFeeCents?: number | null;
  notes?: string;
};
export type ClientNote = { id: string; body: string; createdAt: string };
export type TimelineEvent = { at: string; type: string; label: string };
export type ClientProfile = {
  client: Client;
  ownedProperties: Array<{ id: string; title: string; status: string }>;
  rentingContracts: Array<{
    rentalId: string;
    propertyTitle: string;
    monthlyRent: number;
    status: "active" | "ended";
    since: string;
  }>;
  interestProperty: { id: string; title: string } | null;
  timeline: TimelineEvent[];
  notes: ClientNote[];
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
  footerAddress?: string;
  footerSchedule?: string;
};

export type PropertyOperation = "sale" | "rent";
export type PropertyKind = "flat" | "house" | "commercial" | "land" | "garage";
export type PropertyStatus = "draft" | "published" | "archived";
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
  videos: string[];
  features: string[];
  details: PropertyDetails;
  ownerClientId: string | null;
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
  features?: string[];
  details?: PropertyDetails;
  ownerClientId?: string | null;
};

export type VisitStatus = "requested" | "confirmed" | "done" | "cancelled";
export type Visit = {
  id: string;
  propertyId: string;
  clientId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  scheduledAt: string;
  status: VisitStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
export type VisitInput = {
  status?: VisitStatus;
  scheduledAt?: string;
  notes?: string;
};

export type RentalStatus = "active" | "ended";
export type RentalPayment = {
  id: string;
  rentalId: string;
  period: string; // yyyy-mm-dd (día 1 del mes)
  amount: number;
  status: "pending" | "paid";
  paidAt: string | null;
  notes: string | null;
};
export type Rental = {
  id: string;
  propertyId: string;
  renterClientId: string | null;
  renterName: string;
  monthlyRent: number;
  startDate: string;
  endDate: string | null;
  status: RentalStatus;
  notes: string | null;
  payments: RentalPayment[];
  createdAt: string;
  updatedAt: string;
};
export type RentalInput = {
  propertyId: string;
  renterClientId?: string;
  renterName: string;
  monthlyRent: number;
  startDate: string;
  notes?: string;
};

// Contabilidad: un documento con dirección — gasto que pagamos (expense) o
// factura que emitimos (income). Puede colgar de un inmueble, de un cliente,
// de ambos o de ninguno.
export type InvoiceDirection = "expense" | "income";
export type InvoiceStatus = "draft" | "pending" | "paid" | "cancelled";
export type InvoiceCategory =
  | "water"
  | "electricity"
  | "gas"
  | "community"
  | "taxes"
  | "derrama"
  | "maintenance"
  | "insurance"
  | "management_fee"
  | "commission"
  | "other";
export type InvoicePaymentMethod = "transfer" | "cash" | "card" | "other";

export type InvoicePayment = {
  id: string;
  invoiceId: string;
  amountCents: number;
  paidAt: string;
  method: InvoicePaymentMethod;
  notes: string | null;
  createdAt: string;
};

export type Invoice = {
  id: string;
  direction: InvoiceDirection;
  status: InvoiceStatus;
  propertyId: string | null;
  clientId: string | null;
  rentalId: string | null;
  vendorName: string | null;
  category: InvoiceCategory;
  number: string | null;
  concept: string | null;
  issueDate: string;
  dueDate: string | null;
  subtotalCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  fileUrl: string | null;
  fileName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  payments: InvoicePayment[];
  paidCents: number;
  remainingCents: number;
  overdue: boolean;
};

export type CreateExpenseInput = {
  propertyId?: string;
  clientId?: string;
  vendorName?: string;
  category: InvoiceCategory;
  concept?: string;
  amount: string; // euros con decimales, p. ej. "43.27"
  issueDate: string;
  dueDate?: string;
  status?: "pending" | "paid";
  notes?: string;
  file?: File | null;
};

export type CreateIncomeInput = {
  propertyId?: string;
  clientId?: string;
  rentalId?: string;
  category?: InvoiceCategory;
  concept: string;
  amount: number; // subtotal en euros
  taxRatePercent?: number;
  issueDate: string;
  dueDate?: string;
  notes?: string;
};

export type InvoiceListFilters = {
  direction?: InvoiceDirection;
  propertyId?: string;
  clientId?: string;
  status?: InvoiceStatus;
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
  theme: string;
  activeModules: string[];
  stats: { properties: number; clients: number; visits: number; activeRentals: number };
};
export type CreateTenantInput = {
  slug: string;
  name: string;
  ownerEmail: string;
  ownerPassword: string;
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

  // --- marca: el cliente SOLO gestiona el logo (el design system lo pone la plataforma) ---
  brand: {
    get: (slug: string) =>
      request<{ brandConfig: BrandConfig }>("/tenant/brand", {
        headers: { "x-tenant-slug": slug },
      }),
    uploadLogo: async (slug: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/tenant/brand/logo`, {
        method: "POST",
        credentials: "include",
        headers: { "x-tenant-slug": slug },
        body: fd,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(res.status, b.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as { brandConfig: BrandConfig };
    },
    removeLogo: (slug: string) =>
      request<{ brandConfig: BrandConfig }>("/tenant/brand/logo", {
        method: "DELETE",
        headers: { "x-tenant-slug": slug },
      }),
  },

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

    profile: (slug: string, id: string) =>
      request<ClientProfile>(`/tenant/clients/${id}/profile`, {
        headers: { "x-tenant-slug": slug },
      }),

    addNote: (slug: string, id: string, body: string) =>
      request<{ note: ClientNote }>(`/tenant/clients/${id}/notes`, {
        method: "POST",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify({ body }),
      }),
  },

  // --- módulo Portal del propietario ---
  portal: {
    // Genera (o recupera) el token del enlace del portal para un cliente.
    token: (slug: string, clientId: string) =>
      request<{ token: string }>(`/tenant/portal/clients/${clientId}/token`, {
        method: "POST",
        headers: { "x-tenant-slug": slug },
      }),
  },

  // --- módulo Alquileres ---
  rentals: {
    list: (slug: string) =>
      request<{ rentals: Rental[] }>("/tenant/rentals", { headers: { "x-tenant-slug": slug } }),

    create: (slug: string, data: RentalInput) =>
      request<{ rental: Rental }>("/tenant/rentals", {
        method: "POST",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify(data),
      }),

    update: (slug: string, id: string, data: { status?: RentalStatus; monthlyRent?: number }) =>
      request<{ rental: Rental }>(`/tenant/rentals/${id}`, {
        method: "PATCH",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify(data),
      }),

    // period = "2026-07"
    setPayment: (slug: string, id: string, period: string, status: "paid" | "pending") =>
      request<{ payment: RentalPayment }>(`/tenant/rentals/${id}/payments/${period}`, {
        method: "PUT",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify({ status }),
      }),
  },

  // --- Contabilidad: gastos, facturas emitidas y sus pagos ---
  invoices: {
    list: (slug: string, filters: InvoiceListFilters = {}) => {
      const qs = new URLSearchParams(
        Object.entries(filters).filter((e): e is [string, string] => Boolean(e[1])),
      ).toString();
      return request<{ invoices: Invoice[] }>(`/tenant/invoices${qs ? `?${qs}` : ""}`, {
        headers: { "x-tenant-slug": slug },
      });
    },

    get: (slug: string, id: string) =>
      request<{ invoice: Invoice }>(`/tenant/invoices/${id}`, {
        headers: { "x-tenant-slug": slug },
      }),

    // multipart: campos + factura opcional (el navegador pone el boundary)
    createExpense: async (slug: string, data: CreateExpenseInput) => {
      const fd = new FormData();
      if (data.propertyId) fd.append("propertyId", data.propertyId);
      if (data.clientId) fd.append("clientId", data.clientId);
      if (data.vendorName) fd.append("vendorName", data.vendorName);
      fd.append("category", data.category);
      fd.append("amount", data.amount);
      fd.append("issueDate", data.issueDate);
      if (data.dueDate) fd.append("dueDate", data.dueDate);
      if (data.status) fd.append("status", data.status);
      if (data.concept) fd.append("concept", data.concept);
      if (data.notes) fd.append("notes", data.notes);
      if (data.file) fd.append("file", data.file);
      const res = await fetch(`${API_URL}/tenant/invoices/expense`, {
        method: "POST",
        credentials: "include",
        headers: { "x-tenant-slug": slug },
        body: fd,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(res.status, b.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as { invoice: Invoice };
    },

    createIncome: (slug: string, data: CreateIncomeInput) =>
      request<{ invoice: Invoice }>("/tenant/invoices/income", {
        method: "POST",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify(data),
      }),

    update: (slug: string, id: string, data: { status?: InvoiceStatus; notes?: string }) =>
      request<{ invoice: Invoice }>(`/tenant/invoices/${id}`, {
        method: "PATCH",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify(data),
      }),

    remove: (slug: string, id: string) =>
      request<void>(`/tenant/invoices/${id}`, {
        method: "DELETE",
        headers: { "x-tenant-slug": slug },
      }),

    addPayment: (
      slug: string,
      id: string,
      data: { amount: number; paidAt?: string; method?: InvoicePaymentMethod; notes?: string },
    ) =>
      request<{ invoice: Invoice }>(`/tenant/invoices/${id}/payments`, {
        method: "POST",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify(data),
      }),

    // El endpoint exige la cookie de sesión + header de tenant, así que no
    // sirve un <a href> directo: se descarga como blob y se abre desde JS.
    pdf: async (slug: string, id: string) => {
      const res = await fetch(`${API_URL}/tenant/invoices/${id}/pdf`, {
        credentials: "include",
        headers: { "x-tenant-slug": slug },
      });
      if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
      return res.blob();
    },
  },

  // --- módulo Agenda (visitas) ---
  visits: {
    list: (slug: string) =>
      request<{ visits: Visit[] }>("/tenant/visits", { headers: { "x-tenant-slug": slug } }),

    update: (slug: string, id: string, data: VisitInput) =>
      request<{ visit: Visit }>(`/tenant/visits/${id}`, {
        method: "PATCH",
        headers: { "x-tenant-slug": slug },
        body: JSON.stringify(data),
      }),

    remove: (slug: string, id: string) =>
      request<void>(`/tenant/visits/${id}`, {
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

    uploadVideo: async (slug: string, id: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/tenant/properties/${id}/videos`, {
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

    removeVideo: (slug: string, id: string, url: string) =>
      request<{ property: Property }>(
        `/tenant/properties/${id}/videos?url=${encodeURIComponent(url)}`,
        { method: "DELETE", headers: { "x-tenant-slug": slug } },
      ),
  },

  // --- superadmin ---
  adminCatalog: () => request<{ modules: CatalogModule[] }>("/admin/catalog"),

  adminTenants: () => request<{ tenants: AdminTenant[] }>("/admin/tenants"),

  adminCreateTenant: (data: CreateTenantInput) =>
    request<{ tenant: { id: string; slug: string; name: string }; ownerEmail: string }>(
      "/admin/tenants",
      { method: "POST", body: JSON.stringify(data) },
    ),

  adminSetModule: (slug: string, code: string, active: boolean) =>
    request<{ tenant: string; module: string; active: boolean; activeModules: string[] }>(
      `/admin/tenants/${slug}/modules/${code}`,
      { method: "PUT", body: JSON.stringify({ active }) },
    ),

  adminSetTheme: (slug: string, theme: string) =>
    request<{ tenant: string; theme: string }>(`/admin/tenants/${slug}/theme`, {
      method: "PUT",
      body: JSON.stringify({ theme }),
    }),
};
