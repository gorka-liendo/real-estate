import { randomUUID } from "node:crypto";
import { getStorage, tenantKey } from "@rep/storage";

// Subida de media del micrositio (imagen/vídeo de fondo del hero, etc.).
// Compartido por el endpoint del owner (/tenant/site/media) y el del superadmin
// (/admin/tenants/:slug/media).
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

export type SiteMediaResult =
  | { ok: true; url: string; kind: "image" | "video" }
  | { ok: false; error: "no_file" | "invalid_type" | "too_large" };

export async function saveSiteMedia(tenantId: string, file: unknown): Promise<SiteMediaResult> {
  if (!(file instanceof File)) return { ok: false, error: "no_file" };
  const isImage = file.type in IMAGE_EXT;
  const isVideo = file.type in VIDEO_EXT;
  if (!isImage && !isVideo) return { ok: false, error: "invalid_type" };
  if (file.size > (isVideo ? VIDEO_MAX : IMAGE_MAX)) return { ok: false, error: "too_large" };

  const ext = (isVideo ? VIDEO_EXT : IMAGE_EXT)[file.type]!;
  const key = tenantKey(tenantId, "site", `${randomUUID()}.${ext}`);
  const { url } = await getStorage().put(key, Buffer.from(await file.arrayBuffer()), file.type);
  return { ok: true, url, kind: isVideo ? "video" : "image" };
}
