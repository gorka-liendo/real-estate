// Base URL de la API. Única fuente: NEXT_PUBLIC_API_URL (nunca hardcode).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

// Base URL de los micrositios públicos (tenant-site).
export const TENANT_SITE_URL =
  process.env.NEXT_PUBLIC_TENANT_SITE_URL ?? "http://localhost:3001";
