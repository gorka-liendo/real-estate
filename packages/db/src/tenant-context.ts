import { AsyncLocalStorage } from "node:async_hooks";

export class TenantContextMissingError extends Error {
  constructor() {
    super(
      "Operación tenant-scoped sin tenant en contexto — envuelve la llamada en withTenant() o usa forTenant(tenantId) explícito",
    );
    this.name = "TenantContextMissingError";
  }
}

const storage = new AsyncLocalStorage<{ tenantId: string }>();

/** Ejecuta fn con el tenant en contexto (lo usa el middleware de la API). */
export function withTenant<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

export function currentTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

/** Falla con excepción si no hay tenant — nunca datos vacíos ni fallback silencioso. */
export function requireTenantId(): string {
  const id = currentTenantId();
  if (!id) throw new TenantContextMissingError();
  return id;
}
