import { createMiddleware } from "hono/factory";
import { hasModule, type ModuleCode } from "@rep/modules";
import type { TenantEnv } from "./tenant.middleware.js";

/**
 * Exige que el tenant tenga el módulo contratado y activo
 * (aplicar después de tenantMiddleware). Si no → 403 module_not_active.
 */
export const requireModule = (code: ModuleCode) =>
  createMiddleware<TenantEnv>(async (c, next) => {
    const tenant = c.get("tenant");
    if (!(await hasModule(tenant.id, code))) {
      return c.json({ error: "module_not_active", module: code }, 403);
    }
    await next();
  });
