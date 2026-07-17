"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Card, Switch } from "@rep/ui";
import { useWorkspace } from "@/contexts/workspace-context";
import { api, type AdminTenant, type CatalogModule } from "@/lib/api";
import { routes } from "@/lib/routes";

export default function AdminPage() {
  const { isPlatformAdmin } = useWorkspace();
  const router = useRouter();

  const [catalog, setCatalog] = useState<CatalogModule[]>([]);
  const [tenants, setTenants] = useState<AdminTenant[] | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // guard cliente: si no es superadmin, fuera (el backend ya devuelve 403)
  useEffect(() => {
    if (!isPlatformAdmin) router.replace(routes.home);
  }, [isPlatformAdmin, router]);

  const load = useCallback(async () => {
    const [c, t] = await Promise.all([api.adminCatalog(), api.adminTenants()]);
    setCatalog(c.modules);
    setTenants(t.tenants);
  }, []);

  useEffect(() => {
    if (isPlatformAdmin) void load().catch(() => setError("No se pudieron cargar los datos."));
  }, [isPlatformAdmin, load]);

  async function toggle(tenant: AdminTenant, code: string, next: boolean) {
    const key = `${tenant.slug}:${code}`;
    setPending((p) => new Set(p).add(key));
    setError(null);
    try {
      const res = await api.adminSetModule(tenant.slug, code, next);
      setTenants((prev) =>
        (prev ?? []).map((t) =>
          t.slug === tenant.slug ? { ...t, activeModules: res.activeModules } : t,
        ),
      );
    } catch {
      setError(`No se pudo actualizar ${code} en ${tenant.name}.`);
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    }
  }

  if (!isPlatformAdmin) return null;

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div>
        <h1 className="du-h1">Administración</h1>
        <p className="du-muted" style={{ marginTop: 4 }}>
          Activa o desactiva módulos por inmobiliaria. El cobro se gestiona por factura.
        </p>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      <Card padded={false}>
        <div style={{ overflowX: "auto" }}>
          <table className="du-table">
            <thead>
              <tr>
                <th>Inmobiliaria</th>
                {catalog.map((m) => (
                  <th key={m.code} style={{ textAlign: "center" }}>
                    {m.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants === null ? (
                <tr>
                  <td colSpan={catalog.length + 1} className="du-muted">
                    Cargando…
                  </td>
                </tr>
              ) : (
                tenants.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 500 }}>{t.name}</span>
                        {t.status !== "active" ? (
                          <Badge variant="danger">{t.status}</Badge>
                        ) : null}
                      </div>
                      <span className="du-muted" style={{ fontSize: 12 }}>
                        {t.slug}
                      </span>
                    </td>
                    {catalog.map((m) => {
                      const on = t.activeModules.includes(m.code);
                      const key = `${t.slug}:${m.code}`;
                      return (
                        <td key={m.code} style={{ textAlign: "center" }}>
                          <div style={{ display: "inline-flex" }}>
                            <Switch
                              checked={on}
                              disabled={pending.has(key)}
                              label={`${m.name} en ${t.name}`}
                              onChange={(next) => void toggle(t, m.code, next)}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
