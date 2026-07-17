import { storageEnv } from "./env.js";
import type { PutResult, SignedUpload, StorageDriver } from "./types.js";

// Cloudflare R2 (API S3-compatible). El SDK se carga de forma perezosa para que
// importar el package en local (driver 'local') no cargue AWS SDK ni pida creds.

function requireEnv() {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PUBLIC_URL,
  } = storageEnv;
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET ||
    !R2_PUBLIC_URL
  ) {
    throw new Error(
      "STORAGE_DRIVER=r2 requiere R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET y R2_PUBLIC_URL",
    );
  }
  return { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL };
}

export class R2Storage implements StorageDriver {
  readonly name = "r2";

  private async client() {
    const env = requireEnv();
    const { S3Client } = await import("@aws-sdk/client-s3");
    return {
      s3: new S3Client({
        region: "auto",
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      }),
      bucket: env.R2_BUCKET,
    };
  }

  async put(
    key: string,
    body: Uint8Array | Buffer | string,
    contentType?: string,
  ): Promise<PutResult> {
    const { s3, bucket } = await this.client();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return { key, url: this.publicUrl(key) };
  }

  publicUrl(key: string): string {
    return `${requireEnv().R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }

  async signedUploadUrl(key: string, contentType?: string): Promise<SignedUpload> {
    const { s3, bucket } = await this.client();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: 600 },
    );
    return { key, url, method: "PUT" };
  }

  async remove(key: string): Promise<void> {
    const { s3, bucket } = await this.client();
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
