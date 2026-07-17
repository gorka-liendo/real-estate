import { NextResponse, type NextRequest } from "next/server";

// Resuelve el tenant por el Host y reescribe a /s/<slug>, sin cambiar la URL
// que ve el usuario. Soporta subdominios (martinez.plataforma.app),
// *.localhost en dev, y ?__tenant=slug para probar sin tocar /etc/hosts.
//
// (Fase futura) dominios propios: si el Host no casa con ROOT_DOMAIN, se
// resolverá el slug por custom_domain contra la API.

const ROOT_DOMAINS = ["localhost", "plataforma.app"]; // ajustar en despliegue

function slugFromHost(host: string): string | null {
  const hostname = host.split(":")[0]!;
  const root = ROOT_DOMAINS.find(
    (d) => hostname === d || hostname.endsWith(`.${d}`),
  );
  if (!root) return null; // dominio propio → se resolverá por custom_domain (futuro)
  if (hostname === root) return null; // sin subdominio → landing de la plataforma
  const sub = hostname.slice(0, -(root.length + 1)); // quita ".root"
  if (!sub || sub === "www") return null;
  return sub.split(".")[0]!;
}

export function proxy(req: NextRequest) {
  const url = req.nextUrl;

  // rutas internas y assets: no tocar
  if (url.pathname.startsWith("/s/") || url.pathname.startsWith("/_")) {
    return NextResponse.next();
  }

  const override = url.searchParams.get("__tenant");
  const slug = override || slugFromHost(req.headers.get("host") ?? "");
  if (!slug) return NextResponse.next(); // landing de plataforma en "/"

  const rewritten = url.clone();
  rewritten.pathname = `/s/${slug}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(rewritten);
}

export const config = {
  // excluye assets estáticos y favicon del middleware
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)"],
};
