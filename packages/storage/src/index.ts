import { storageEnv } from "./env.js";
import { LocalStorage } from "./local.js";
import { R2Storage } from "./r2.js";
import type { StorageDriver } from "./types.js";

export type { StorageDriver, PutResult, SignedUpload } from "./types.js";
export { LocalStorage } from "./local.js";
export { R2Storage } from "./r2.js";

let instance: StorageDriver | undefined;

/** Devuelve el driver según STORAGE_DRIVER (por defecto 'local'). Singleton. */
export function getStorage(): StorageDriver {
  if (!instance) {
    instance = storageEnv.STORAGE_DRIVER === "r2" ? new R2Storage() : new LocalStorage();
  }
  return instance;
}

/** Genera una clave namespaced por tenant: <tenantId>/<carpeta>/<archivo>. */
export function tenantKey(tenantId: string, ...parts: string[]): string {
  return [tenantId, ...parts].join("/");
}
