import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, tenants } from "@rep/db";
import { getStorage, tenantKey } from "@rep/storage";
import {
  authMiddleware,
  requireMembership,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import { siteConfigSchema } from "./site.schema.js";

// Media del micrositio (imágenes y vídeos de fondo del hero, etc.). Mismo
// criterio que las fotos/vídeos de propiedad.
const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
const VIDEO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
const IMAGE_MAX = 10 * 1024 * 1024; // 10 MB
const VIDEO_MAX = 200 * 1024 * 1024; // 200 MB

// Editor del contenido del micrositio (site_config) — bajo /tenant/site.
// El tenant se edita a sí mismo: id del contexto, tras auth + membership + módulo.
export const site = new Hono<MemberEnv>();

site.use("*", authMiddleware);
site.use("*", requireMembership);
site.use("*", requireModule("microsite"));

site.get("/", (c) => {
  return c.json({ siteConfig: c.get("tenant").siteConfig });
});

site.patch("/", async (c) => {
  const body = siteConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);

  const [row] = await db
    .update(tenants)
    .set({ siteConfig: body.data })
    .where(eq(tenants.id, c.get("tenant").id))
    .returning();
  return c.json({ siteConfig: row!.siteConfig });
});

// Sube media del micrositio (imagen o vídeo) a @rep/storage y devuelve su URL +
// tipo. El editor guarda esa URL en el campo correspondiente (p.ej. fondo del
// hero) vía PATCH. El tipo se detecta por el content-type del archivo.
site.post("/media", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "no_file" }, 400);

  const isImage = file.type in IMAGE_EXT;
  const isVideo = file.type in VIDEO_EXT;
  if (!isImage && !isVideo) return c.json({ error: "invalid_type" }, 400);
  if (file.size > (isVideo ? VIDEO_MAX : IMAGE_MAX)) return c.json({ error: "too_large" }, 400);

  const ext = (isVideo ? VIDEO_EXT : IMAGE_EXT)[file.type]!;
  const key = tenantKey(c.get("tenant").id, "site", `${randomUUID()}.${ext}`);
  const { url } = await getStorage().put(key, Buffer.from(await file.arrayBuffer()), file.type);
  return c.json({ url, kind: isVideo ? "video" : "image" }, 201);
});
