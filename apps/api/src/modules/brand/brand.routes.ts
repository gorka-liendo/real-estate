import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, tenants } from "@rep/db";
import { getStorage, tenantKey } from "@rep/storage";
import {
  authMiddleware,
  requireMembership,
  requireRole,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";

// Marca del tenant. IMPORTANTE: el design system (colores/radios/tipografía) lo
// entrega la PLATAFORMA (superadmin), NO el cliente — es el valor que se paga.
// El cliente aquí SOLO gestiona su LOGO.
export const brand = new Hono<MemberEnv>();

brand.use("*", authMiddleware);
brand.use("*", requireMembership);

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

brand.get("/", (c) => {
  return c.json({ brandConfig: c.get("tenant").brandConfig });
});

brand.post("/logo", requireRole("owner"), async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "no_file" }, 400);
  if (!ALLOWED.has(file.type)) return c.json({ error: "invalid_type" }, 400);
  if (file.size > 2 * 1024 * 1024) return c.json({ error: "too_large" }, 400);

  const tenant = c.get("tenant");
  const key = tenantKey(tenant.id, "brand", `logo-${randomUUID()}.${EXT[file.type]}`);
  const { url } = await getStorage().put(
    key,
    Buffer.from(await file.arrayBuffer()),
    file.type,
  );
  const [row] = await db
    .update(tenants)
    .set({ brandConfig: { ...tenant.brandConfig, logoUrl: url } })
    .where(eq(tenants.id, tenant.id))
    .returning();
  return c.json({ brandConfig: row!.brandConfig });
});

brand.delete("/logo", requireRole("owner"), async (c) => {
  const tenant = c.get("tenant");
  const { logoUrl: _drop, ...rest } = tenant.brandConfig;
  const [row] = await db
    .update(tenants)
    .set({ brandConfig: rest })
    .where(eq(tenants.id, tenant.id))
    .returning();
  return c.json({ brandConfig: row!.brandConfig });
});
