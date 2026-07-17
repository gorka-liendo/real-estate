import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth, authEnv } from "@rep/auth";
import { db, memberships, subscriptions, tenantDb, tenants } from "@rep/db";
import {
  authMiddleware,
  requireMembership,
  type AuthEnv,
  type MemberEnv,
} from "./middlewares/auth.middleware.js";
import { tenantMiddleware, type TenantEnv } from "./middlewares/tenant.middleware.js";

// app sin listen() — importable en tests (mismo patrón que app.ts/server.ts en Express)
export const app = new Hono();

app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok" }));

// --- auth: Better-Auth gestiona /api/auth/* (sign-up, sign-in, sign-out, session…) ---
app.use(
  "/api/auth/*",
  cors({ origin: authEnv.TRUSTED_ORIGINS, credentials: true }),
);
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
  return c.json({
    user: { id: currentUser.id, email: currentUser.email, name: currentUser.name },
    memberships: rows,
  });
});
app.route("/me", me);

// --- rutas tenant-scoped públicas (micrositio) ---
const tenant = new Hono<TenantEnv>();
tenant.use("*", tenantMiddleware);

tenant.get("/", (c) => {
  const t = c.get("tenant");
  return c.json({ id: t.id, slug: t.slug, name: t.name, brandConfig: t.brandConfig });
});

tenant.get("/subscriptions", async (c) => {
  const rows = await tenantDb().select(subscriptions);
  return c.json(rows);
});

// --- rutas tenant-scoped privadas (dashboard): sesión + membership obligatorias ---
const team = new Hono<MemberEnv>();
team.use("*", authMiddleware);
team.use("*", requireMembership);

team.get("/", async (c) => {
  const rows = await tenantDb().select(memberships);
  return c.json({ role: c.get("role"), members: rows });
});

tenant.route("/team", team);

app.route("/tenant", tenant);
