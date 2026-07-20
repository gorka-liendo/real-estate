import { NextResponse, type NextRequest } from "next/server";

// Resuelve el tenant por el Host y reescribe a /s/<slug>, sin cambiar la URL que
// ve el usuario. Tres vías de resolución:
//   1. ?__tenant=slug (dev, para probar sin tocar /etc/hosts)
//   2. Subdominio de la plataforma: martinez.plataforma.app → "martinez"
//   3. Dominio propio (custom_domain): www.inmobiliaria-martinez.es → lookup a
//      la API (server-side, cacheado) → "martinez"
//
// La raíz de la plataforma es configurable por env (NEXT_PUBLIC_ROOT_DOMAIN);
// "localhost" se acepta siempre para desarrollo.

const ROOT_DOMAINS = [
  "localhost",
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "plataforma.app",
];

/** slug si el host es un subdominio de la plataforma; null en otro caso. */
function slugFromHost(host: string): string | null {
  const hostname = host.split(":")[0]!;
  const root = ROOT_DOMAINS.find((d) => hostname === d || hostname.endsWith(`.${d}`));
  if (!root) return null; // dominio propio → se resuelve por custom_domain
  if (hostname === root) return null; // sin subdominio → landing de la plataforma
  const sub = hostname.slice(0, -(root.length + 1)); // quita ".root"
  if (!sub || sub === "www") return null;
  return sub.split(".")[0]!;
}

/** ¿el host es (un subdominio de) la raíz de la plataforma? */
function isPlatformHost(host: string): boolean {
  const hostname = host.split(":")[0]!;
  return ROOT_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

// Caché en memoria (por instancia) del lookup dominio→slug: el proxy corre en
// CADA request, así que no podemos pegarle a la API siempre. TTL corto; se
// cachea también el negativo (dominio no registrado) con TTL menor.
type CacheEntry = { slug: string | null; exp: number };
const domainCache = new Map<string, CacheEntry>();
const POSITIVE_TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 20_000;

async function resolveCustomDomain(host: string): Promise<string | null> {
  const key = host.split(":")[0]!.toLowerCase();
  const cached = domainCache.get(key);
  if (cached && cached.exp > Date.now()) return cached.slug;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  let slug: string | null = null;
  try {
    const res = await fetch(`${apiUrl}/public/resolve-domain?host=${encodeURIComponent(key)}`);
    if (res.ok) slug = ((await res.json()) as { slug?: string }).slug ?? null;
  } catch {
    // API caída: no cacheamos (para reintentar pronto) y dejamos pasar.
    return null;
  }
  domainCache.set(key, { slug, exp: Date.now() + (slug ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) });
  return slug;
}

export async function proxy(req: NextRequest) {
  const url = req.nextUrl;

  // rutas internas y assets: no tocar
  if (url.pathname.startsWith("/s/") || url.pathname.startsWith("/_")) {
    return NextResponse.next();
  }

  const host = req.headers.get("host") ?? "";
  // Precedencia: ?__tenant (dev) → subdominio → cookie (dev, para que la
  // navegación interna sin el query param —p.ej. /propiedad/:id— siga
  // resolviendo el tenant en pruebas con ?__tenant).
  const override = url.searchParams.get("__tenant");
  const cookieSlug = req.cookies.get("__tenant")?.value ?? null;
  let slug = override || slugFromHost(host) || cookieSlug;

  // Dominio propio: si no es la plataforma y no hay slug aún, lo resolvemos por
  // custom_domain contra la API (cacheado).
  if (!slug && !isPlatformHost(host)) {
    slug = await resolveCustomDomain(host);
  }

  if (!slug) return NextResponse.next(); // landing de plataforma en "/"

  const rewritten = url.clone();
  rewritten.pathname = `/s/${slug}${url.pathname === "/" ? "" : url.pathname}`;
  const res = NextResponse.rewrite(rewritten);
  // Recuerda el tenant elegido con ?__tenant para las siguientes navegaciones.
  if (override) res.cookies.set("__tenant", override, { path: "/", sameSite: "lax" });
  return res;
}

export const config = {
  // excluye assets estáticos y favicon del middleware
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)"],
};
