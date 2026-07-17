import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Fija el driver local en un dir temporal ABSOLUTO antes de importar el package.
const dir = mkdtempSync(join(tmpdir(), "rep-storage-"));
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = dir; // absoluto → root del driver = dir
process.env.STORAGE_PUBLIC_URL = "http://localhost:3002/uploads";

const { getStorage, tenantKey } = await import("../index.js");

describe("LocalStorage (driver por defecto)", () => {
  const storage = getStorage();

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("usa el driver local", () => {
    expect(storage.name).toBe("local");
  });

  it("put escribe el fichero y devuelve URL pública", async () => {
    const key = tenantKey("tenant-1", "img", "a.txt");
    const res = await storage.put(key, "hola");
    expect(res.key).toBe(key);
    expect(res.url).toBe(`http://localhost:3002/uploads/${key}`);
    expect(readFileSync(join(dir, key)).toString()).toBe("hola");
  });

  it("tenantKey namespacea por tenant", () => {
    expect(tenantKey("t1", "fotos", "casa.jpg")).toBe("t1/fotos/casa.jpg");
  });

  it("remove borra el fichero", async () => {
    const key = tenantKey("tenant-1", "del.txt");
    await storage.put(key, "x");
    await storage.remove(key);
    expect(() => readFileSync(join(dir, key))).toThrow();
  });
});
