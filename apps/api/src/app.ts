import { serveStatic } from "@hono/node-server/serve-static";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth, authEnv } from "@rep/auth";
import { db, memberships, platformAdmins, tenantDb, tenants } from "@rep/db";
import { getActiveModules } from "@rep/modules";
import {
  authMiddleware,
  requireMembership,
  type AuthEnv,
  type MemberEnv,
} from "./middlewares/auth.middleware.js";
import { requireModule } from "./middlewares/module.middleware.js";
import { tenantMiddleware, type TenantEnv } from "./middlewares/tenant.middleware.js";
import { admin } from "./modules/admin/admin.routes.js";
import { brand } from "./modules/brand/brand.routes.js";
import { clients } from "./modules/clients/clients.routes.js";
import { invoices } from "./modules/invoices/invoices.routes.js";
import { leads } from "./modules/leads/leads.routes.js";
import { portal } from "./modules/portal/portal.routes.js";
import { rentals } from "./modules/rentals/rentals.routes.js";
import { rooms } from "./modules/rentals/rooms.routes.js";
import { valuations } from "./modules/valuations/valuations.routes.js";
import { visits } from "./modules/visits/visits.routes.js";
import { properties } from "./modules/properties/properties.routes.js";
import {
  getPublishedProperty,
  listPublishedProperties,
} from "./modules/properties/properties.service.js";
import { site } from "./modules/site/site.routes.js";

// app sin listen() — importable en tests (mismo patrón que app.ts/server.ts en Express)
export const app = new Hono();

app.use("*", logger());

// Endpoints públicos del micrositio, llamados desde el NAVEGADOR del tenant-site,
// que en producción vive en dominios/subdominios de inmobiliaria dinámicos (no en
// una lista fija). No usan credenciales → CORS abierto solo para ellos.
function isPublicMicrositePath(path: string): boolean {
  return (
    path === "/tenant" ||
    path === "/tenant/modules" ||
    path === "/tenant/microsite" ||
    path === "/tenant/leads" ||
    path === "/tenant/valuations" ||
    path === "/tenant/visits/request" || // SOLO el POST público; el resto de /visits es privado
    path.startsWith("/tenant/listings")
  );
}

// CORS: para las rutas públicas del micrositio reflejamos cualquier origen (sin
// datos con credenciales); para el resto (dashboard/auth con cookies httpOnly)
// solo orígenes de confianza. Un único middleware → la preflight se resuelve bien.
app.use(
  "*",
  cors({
    credentials: true,
    origin: (origin, c) => {
      if (isPublicMicrositePath(c.req.path)) return origin || "*";
      return authEnv.TRUSTED_ORIGINS.includes(origin) ? origin : null;
    },
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

// PÚBLICO: resuelve un dominio propio (custom_domain) → slug del tenant. Lo
// consume el proxy del tenant-site SERVER-SIDE (no el navegador) para enrutar
// dominios que no son subdominios de la plataforma. Sin credenciales, sin CORS.
app.get("/public/resolve-domain", async (c) => {
  const host = (c.req.query("host") ?? "").split(":")[0]!.trim().toLowerCase();
  if (!host) return c.json({ error: "host_required" }, 400);
  const t = await db.query.tenants.findFirst({
    columns: { slug: true, status: true },
    where: eq(tenants.customDomain, host),
  });
  if (!t || t.status !== "active") return c.json({ error: "not_found" }, 404);
  return c.json({ slug: t.slug });
});

// Sirve las imágenes del storage local (dev). En prod las sirve R2/CDN.
app.use(
  "/uploads/*",
  serveStatic({ root: "./.uploads", rewriteRequestPath: (p) => p.replace(/^\/uploads/, "") }),
);

// --- auth: Better-Auth gestiona /api/auth/* (sign-up, sign-in, sign-out, session…) ---
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// --- /me: usuario de la sesión + sus tenants y roles ---
const me = new Hono<AuthEnv>();
me.use("*", authMiddleware);
me.get("/", async (c) => {
  const currentUser = c.get("user");
  const rows = await db
    .select({ slug: tenants.slug, name: tenants.name, role: memberships.role })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(eq(memberships.userId, currentUser.id));
  const platformAdmin = await db.query.platformAdmins.findFirst({
    where: eq(platformAdmins.userId, currentUser.id),
  });
  return c.json({
    user: { id: currentUser.id, email: currentUser.email, name: currentUser.name },
    memberships: rows,
    isPlatformAdmin: Boolean(platformAdmin),
  });
});
app.route("/me", me);

// --- panel de superadmin (gestión de tenants y módulos) ---
app.route("/admin", admin);

// --- rutas tenant-scoped públicas (micrositio) ---
const tenant = new Hono<TenantEnv>();
tenant.use("*", tenantMiddleware);

tenant.get("/", (c) => {
  const t = c.get("tenant");
  // Público (micrositio): NO exponemos el id interno del tenant.
  return c.json({
    slug: t.slug,
    name: t.name,
    brandConfig: t.brandConfig,
    siteConfig: t.siteConfig,
  });
});

// códigos de módulos activos — lo consume el dashboard (useModule) y el tenant-site
tenant.get("/modules", async (c) => {
  return c.json({ modules: await getActiveModules(c.get("tenant").id) });
});

// demo de ruta gateada por módulo: los datos del micrositio solo si está contratado
tenant.get("/microsite", requireModule("microsite"), (c) => {
  const t = c.get("tenant");
  return c.json({ slug: t.slug, name: t.name, brandConfig: t.brandConfig });
});

// PÚBLICO: propiedades publicadas para el micrositio (gateado por 'microsite').
tenant.get("/listings", requireModule("microsite"), async (c) => {
  return c.json({ properties: await listPublishedProperties() });
});

// PÚBLICO: ficha de una propiedad publicada por id.
tenant.get("/listings/:id", requireModule("microsite"), async (c) => {
  const property = await getPublishedProperty(c.req.param("id"));
  if (!property) return c.json({ error: "not_found" }, 404);
  return c.json({ property });
});

// PÚBLICO: captación de leads desde el micrositio → cliente stage 'lead'.
tenant.route("/leads", leads);

// PÚBLICO: widget "Valora tu piso gratis" → estimación + lead de propietario.
tenant.route("/valuations", valuations);

// Agenda de visitas: POST /request público (ficha) + gestión privada (dashboard).
tenant.route("/visits", visits);

// Portal del propietario: GET /:token público (lo consume el tenant-site
// server-side, sin CORS) + generación de token privada (dashboard).
tenant.route("/portal", portal);

// --- rutas tenant-scoped privadas (dashboard): sesión + membership obligatorias ---
const team = new Hono<MemberEnv>();
team.use("*", authMiddleware);
team.use("*", requireMembership);

team.get("/", async (c) => {
  const rows = await tenantDb().select(memberships);
  return c.json({ role: c.get("role"), members: rows });
});

tenant.route("/team", team);

// --- editores de marca (dashboard + micrositio) y contenido del micrositio ---
tenant.route("/brand", brand);
tenant.route("/site", site);

// --- módulos funcionales tenant-scoped ---
tenant.route("/clients", clients);
tenant.route("/properties", properties);
tenant.route("/rentals", rentals);
tenant.route("/rooms", rooms);
tenant.route("/invoices", invoices);

app.route("/tenant", tenant);
