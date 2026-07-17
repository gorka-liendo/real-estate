import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { storageEnv } from "./env.js";
import type { PutResult, SignedUpload, StorageDriver } from "./types.js";

/**
 * Almacenamiento en filesystem para desarrollo local — sin credenciales.
 * Escribe bajo STORAGE_LOCAL_DIR y sirve las URLs bajo STORAGE_PUBLIC_URL.
 * (El servido HTTP de esos ficheros se cablea cuando haga falta; para desarrollo
 * basta con tener los binarios en disco.)
 */
export class LocalStorage implements StorageDriver {
  readonly name = "local";
  private readonly root = resolve(process.cwd(), storageEnv.STORAGE_LOCAL_DIR);

  async put(
    key: string,
    body: Uint8Array | Buffer | string,
    _contentType?: string,
  ): Promise<PutResult> {
    const dest = join(this.root, key);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, body);
    return { key, url: this.publicUrl(key) };
  }

  publicUrl(key: string): string {
    return `${storageEnv.STORAGE_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }

  async signedUploadUrl(key: string): Promise<SignedUpload> {
    // en local no hay firma real: se sube vía API. Devolvemos la URL destino.
    return { key, url: this.publicUrl(key), method: "PUT" };
  }

  async remove(key: string): Promise<void> {
    await rm(join(this.root, key), { force: true });
  }
}
