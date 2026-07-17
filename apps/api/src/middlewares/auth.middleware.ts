import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { auth } from "@rep/auth";
import { db, memberships, type MembershipRole, type User } from "@rep/db";
import type { TenantEnv } from "./tenant.middleware.js";

export type AuthEnv = { Variables: { user: User } };
export type MemberEnv = TenantEnv & AuthEnv & { Variables: { role: MembershipRole } };

/** Exige sesión válida de Better-Auth (cookie httpOnly) → rellena c.var.user. */
export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("user", session.user as User);
  await next();
});

/**
 * Exige que el usuario de la sesión sea miembro del tenant resuelto
 * (aplicar SIEMPRE después de tenantMiddleware + authMiddleware).
 * Rellena c.var.role para RBAC fino en el handler.
 */
export const requireMembership = createMiddleware<MemberEnv>(async (c, next) => {
  const tenant = c.get("tenant");
  const currentUser = c.get("user");

  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.tenantId, tenant.id),
      eq(memberships.userId, currentUser.id),
    ),
  });
  if (!membership) return c.json({ error: "forbidden" }, 403);

  c.set("role", membership.role);
  await next();
});

/** RBAC: exige uno de los roles indicados (después de requireMembership). */
export const requireRole = (...roles: MembershipRole[]) =>
  createMiddleware<MemberEnv>(async (c, next) => {
    if (!roles.includes(c.get("role"))) return c.json({ error: "forbidden" }, 403);
    await next();
  });
