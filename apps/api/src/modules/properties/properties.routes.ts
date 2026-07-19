import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { clients, tenantDb } from "@rep/db";
import { getStorage, tenantKey } from "@rep/storage";
import {
  authMiddleware,
  requireMembership,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import { createPropertySchema, updatePropertySchema } from "./properties.schema.js";
import * as service from "./properties.service.js";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
const VIDEO_ALLOWED = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const VIDEO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

// Rutas del módulo Propiedades, bajo /tenant/properties.
// Guardas: tenantMiddleware (app.ts) → auth → membership → módulo 'properties'.
export const properties = new Hono<MemberEnv>();

properties.use("*", authMiddleware);
properties.use("*", requireMembership);
properties.use("*", requireModule("properties"));

properties.get("/", async (c) => {
  return c.json({ properties: await service.listProperties() });
});

// El propietario debe ser un cliente DEL tenant (tenantDb → aislamiento).
async function ownerExists(ownerClientId: string): Promise<boolean> {
  const rows = await tenantDb().select(clients, eq(clients.id, ownerClientId));
  return rows.length > 0;
}

properties.post("/", async (c) => {
  const body = createPropertySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  if (body.data.ownerClientId && !(await ownerExists(body.data.ownerClientId))) {
    return c.json({ error: "invalid_owner" }, 400);
  }
  return c.json({ property: await service.createProperty(body.data) }, 201);
});

properties.patch("/:id", async (c) => {
  const body = updatePropertySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  if (body.data.ownerClientId && !(await ownerExists(body.data.ownerClientId))) {
    return c.json({ error: "invalid_owner" }, 400);
  }
  const updated = await service.updateProperty(c.req.param("id"), body.data);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ property: updated });
});

properties.delete("/:id", async (c) => {
  const ok = await service.deleteProperty(c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.body(null, 204);
});

// --- fotos ---
properties.post("/:id/photos", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "no_file" }, 400);
  if (!ALLOWED.has(file.type)) return c.json({ error: "invalid_type" }, 400);
  if (file.size > 8 * 1024 * 1024) return c.json({ error: "too_large" }, 400);

  const tenantId = c.get("tenant").id;
  const id = c.req.param("id");
  const key = tenantKey(tenantId, "properties", id, `${randomUUID()}.${EXT[file.type]}`);
  const { url } = await getStorage().put(
    key,
    Buffer.from(await file.arrayBuffer()),
    file.type,
  );
  const updated = await service.addPhoto(id, url);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ property: updated }, 201);
});

properties.delete("/:id/photos", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "missing_url" }, 400);
  const updated = await service.removePhoto(c.req.param("id"), url);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ property: updated });
});

// --- vídeos (self-hosted; en dev disco local, en prod R2/Railway) ---
properties.post("/:id/videos", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "no_file" }, 400);
  if (!VIDEO_ALLOWED.has(file.type)) return c.json({ error: "invalid_type" }, 400);
  if (file.size > 200 * 1024 * 1024) return c.json({ error: "too_large" }, 400);

  const tenantId = c.get("tenant").id;
  const id = c.req.param("id");
  const key = tenantKey(tenantId, "properties", id, `${randomUUID()}.${VIDEO_EXT[file.type]}`);
  const { url } = await getStorage().put(
    key,
    Buffer.from(await file.arrayBuffer()),
    file.type,
  );
  const updated = await service.addVideo(id, url);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ property: updated }, 201);
});

properties.delete("/:id/videos", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "missing_url" }, 400);
  const updated = await service.removeVideo(c.req.param("id"), url);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ property: updated });
});
