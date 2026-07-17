import { and, eq, type InferSelectModel, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import { db } from "./client.js";
import { requireTenantId } from "./tenant-context.js";

/** Toda tabla con columna tenant_id. Sus queries SOLO pasan por forTenant/tenantDb. */
export type TenantScopedTable = PgTable & { tenantId: AnyPgColumn };

/**
 * Acceso scoped a un tenant explícito. El filtro tenant_id se aplica SIEMPRE:
 * el `where` extra del caller se combina con AND — es imposible saltarse el scope.
 */
export function forTenant(tenantId: string) {
  const scope = (table: TenantScopedTable, extra?: SQL): SQL => {
    const base = eq(table.tenantId, tenantId);
    return extra ? and(base, extra)! : base;
  };

  return {
    tenantId,

    select<T extends TenantScopedTable>(table: T, where?: SQL) {
      // cast interno: los genéricos condicionales de drizzle no resuelven sobre T abstracto
      return db
        .select()
        .from(table as PgTable)
        .where(scope(table, where)) as unknown as Promise<InferSelectModel<T>[]>;
    },

    insert<T extends TenantScopedTable>(
      table: T,
      values: Omit<T["$inferInsert"], "tenantId">,
    ) {
      // el tenantId lo pone el scope — el caller no puede insertar en otro tenant.
      // cast interno: los genéricos condicionales de drizzle no resuelven sobre T abstracto
      return db
        .insert(table as PgTable)
        .values({ ...values, tenantId } as PgTable["$inferInsert"]);
    },

    update<T extends TenantScopedTable>(table: T, set: PgUpdateSetSource<T>, where?: SQL) {
      return db.update(table).set(set).where(scope(table, where));
    },

    delete<T extends TenantScopedTable>(table: T, where?: SQL) {
      return db.delete(table).where(scope(table, where));
    },
  };
}

/** Acceso scoped al tenant del contexto actual (rellenado por el middleware). */
export function tenantDb() {
  return forTenant(requireTenantId());
}
