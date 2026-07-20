// Base URL de la API. Única fuente: NEXT_PUBLIC_API_URL (nunca hardcode).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

// Base URL de los micrositios públicos (tenant-site).
export const TENANT_SITE_URL =
  process.env.NEXT_PUBLIC_TENANT_SITE_URL ?? "http://localhost:3001";

// Registros DNS que el cliente configura para apuntar su dominio a la
// plataforma de hosting (Vercel). Un SUBDOMINIO (www.x.com) usa CNAME; el
// dominio RAÍZ/apex (x.com) NO admite CNAME → registro A a la IP de Vercel.
// Defaults = valores documentados de Vercel; configurables por env. Solo
// informativos en el panel (los definitivos los confirma Vercel al activarse).
export const DOMAIN_CNAME_TARGET =
  process.env.NEXT_PUBLIC_DOMAIN_CNAME_TARGET ?? "cname.vercel-dns.com";
export const DOMAIN_A_RECORD =
  process.env.NEXT_PUBLIC_DOMAIN_A_RECORD ?? "76.76.21.21";
