// Contrato común de almacenamiento. Los módulos usan SIEMPRE esta interfaz,
// nunca un cliente S3/R2 directo → el driver se cambia por env sin tocar código.
export interface StorageDriver {
  readonly name: string;

  /** Sube un objeto y devuelve su clave y URL pública. */
  put(key: string, body: Uint8Array | Buffer | string, contentType?: string): Promise<PutResult>;

  /** URL pública de lectura para una clave. */
  publicUrl(key: string): string;

  /** URL firmada para subida directa desde el cliente (el navegador sube a R2). */
  signedUploadUrl(key: string, contentType?: string): Promise<SignedUpload>;

  /** Elimina un objeto. */
  remove(key: string): Promise<void>;
}

export type PutResult = { key: string; url: string };
export type SignedUpload = { key: string; url: string; method: "PUT" };
