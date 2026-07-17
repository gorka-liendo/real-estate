import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db, platformAdmins } from "@rep/db";
import type { AuthEnv } from "./auth.middleware.js";

/**
 * Exige que el usuario de la sesión sea superadmin de la PLATAFORMA
 * (aplicar después de authMiddleware). No confundir con roles de tenant.
 */
export const requirePlatformAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const currentUser = c.get("user");
  const admin = await db.query.platformAdmins.findFirst({
    where: eq(platformAdmins.userId, currentUser.id),
  });
  if (!admin) return c.json({ error: "forbidden" }, 403);
  await next();
});
