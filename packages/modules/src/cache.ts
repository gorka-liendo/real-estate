/**
 * Caché de flags detrás de una interfaz: hoy memoria con TTL,
 * en Fase E se sustituye por Redis con setFlagCache() — una línea.
 */
export interface FlagCache {
  get(tenantId: string): Promise<string[] | undefined> | (string[] | undefined);
  set(tenantId: string, codes: string[]): Promise<void> | void;
  delete(tenantId: string): Promise<void> | void;
}

export class MemoryFlagCache implements FlagCache {
  private store = new Map<string, { codes: string[]; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(tenantId: string): string[] | undefined {
    const entry = this.store.get(tenantId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(tenantId);
      return undefined;
    }
    return entry.codes;
  }

  set(tenantId: string, codes: string[]): void {
    this.store.set(tenantId, { codes, expiresAt: Date.now() + this.ttlMs });
  }

  delete(tenantId: string): void {
    this.store.delete(tenantId);
  }
}
