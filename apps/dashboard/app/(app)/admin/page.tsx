"use client";

import { Building2, CalendarClock, ExternalLink, KeyRound, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card, Input, Label, Select, Switch, THEMES } from "@rep/ui";
import { useWorkspace } from "@/contexts/workspace-context";
import { api, ApiError, type AdminTenant, type CatalogModule } from "@/lib/api";
import { TENANT_SITE_URL } from "@/lib/config";
import { routes } from "@/lib/routes";

// Panel de plataforma: una tarjeta por inmobiliaria con sus stats, su diseño,
// su micrositio y los módulos contratados (con precio). + Alta de inmobiliarias.

const eur = (cents: number) => `${new Intl.NumberFormat("es-ES").format(cents / 100)} €/mes`;

export default function AdminPage() {
  const { isPlatformAdmin } = useWorkspace();
  const router = useRouter();

  const [catalog, setCatalog] = useState<CatalogModule[]>([]);
  const [tenants, setTenants] = useState<AdminTenant[] | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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

  async function setTheme(tenant: AdminTenant, theme: string) {
    setError(null);
    try {
      const res = await api.adminSetTheme(tenant.slug, theme);
      setTenants((prev) =>
        (prev ?? []).map((t) => (t.slug === tenant.slug ? { ...t, theme: res.theme } : t)),
      );
    } catch {
      setError(`No se pudo cambiar el diseño de ${tenant.name}.`);
    }
  }

  if (!isPlatformAdmin) return null;

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 className="du-h1">Administración</h1>
          <p className="du-muted" style={{ marginTop: 4 }}>
            Inmobiliarias de la plataforma: módulos, diseño y altas. El cobro va por factura.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} />
          Nueva inmobiliaria
        </Button>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      {showForm ? (
        <NewTenantForm
          onCreated={() => {
            setShowForm(false);
            void load();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {tenants === null ? (
        <p className="du-muted">Cargando…</p>
      ) : (
        tenants.map((t) => (
          <Card key={t.id}>
            {/* cabecera: nombre, slug, estado, tema, micrositio */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "var(--ui-sp-4)",
                marginBottom: "var(--ui-sp-4)",
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <h2 className="du-h3" style={{ margin: 0 }}>
                  {t.name}{" "}
                  <span className="du-muted" style={{ fontSize: 13, fontWeight: 400 }}>
                    · {t.slug}
                  </span>
                </h2>
                {t.status !== "active" ? <Badge variant="danger">{t.status}</Badge> : null}
              </div>
              <Select
                value={t.theme}
                onChange={(e) => void setTheme(t, e.target.value)}
                style={{ maxWidth: 220 }}
                aria-label={`Tema de ${t.name}`}
              >
                {THEMES.map((th) => (
                  <option key={th.id} value={th.id}>
                    Tema: {th.label}
                  </option>
                ))}
                {THEMES.every((th) => th.id !== t.theme) ? (
                  <option value={t.theme}>{t.theme} (a medida)</option>
                ) : null}
              </Select>
              <ButtonLink
                href={`${TENANT_SITE_URL}/?__tenant=${t.slug}`}
                target="_blank"
                variant="ghost"
                size="sm"
              >
                <ExternalLink size={14} />
                Micrositio
              </ButtonLink>
            </div>

            {/* stats */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--ui-sp-5)",
                marginBottom: "var(--ui-sp-4)",
                color: "var(--ui-muted)",
                fontSize: 13,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Building2 size={14} /> {t.stats.properties} inmuebles
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Users size={14} /> {t.stats.clients} clientes
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <CalendarClock size={14} /> {t.stats.visits} visitas
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <KeyRound size={14} /> {t.stats.activeRentals} alquileres activos
              </span>
              <span>
                {t.activeModules.length} de {catalog.length} módulos ·{" "}
                {eur(
                  catalog
                    .filter((m) => t.activeModules.includes(m.code))
                    .reduce((a, m) => a + m.priceMonthly, 0),
                )}
              </span>
            </div>

            {/* módulos con nombre + precio */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: "var(--ui-sp-2) var(--ui-sp-4)",
                borderTop: "1px solid var(--ui-border)",
                paddingTop: "var(--ui-sp-4)",
              }}
            >
              {catalog.map((m) => {
                const on = t.activeModules.includes(m.code);
                const key = `${t.slug}:${m.code}`;
                return (
                  <div
                    key={m.code}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--ui-sp-3)",
                      padding: "6px 0",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: on ? 500 : 400 }}>{m.name}</div>
                      <div className="du-muted" style={{ fontSize: 12 }}>
                        {eur(m.priceMonthly)}
                      </div>
                    </div>
                    <Switch
                      checked={on}
                      disabled={pending.has(key)}
                      label={`${m.name} en ${t.name}`}
                      onChange={(next) => void toggle(t, m.code, next)}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function NewTenantForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.adminCreateTenant({ slug, name, ownerEmail, ownerPassword });
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError && err.message === "slug_taken"
          ? `El slug "${slug}" ya está en uso.`
          : "No se pudo crear la inmobiliaria. Revisa los datos (slug en minúsculas, contraseña de 8+).",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
        Nueva inmobiliaria
      </h2>
      <form onSubmit={submit} style={{ display: "grid", gap: "var(--ui-sp-4)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--ui-sp-4)",
          }}
        >
          <div>
            <Label htmlFor="nt-name">Nombre</Label>
            <Input
              id="nt-name"
              required
              placeholder="Inmobiliaria García"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="nt-slug">Slug (subdominio)</Label>
            <Input
              id="nt-slug"
              required
              placeholder="garcia"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
          </div>
          <div>
            <Label htmlFor="nt-email">Email del owner</Label>
            <Input
              id="nt-email"
              type="email"
              required
              placeholder="dueño@garcia.com"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="nt-pass">Contraseña inicial</Label>
            <Input
              id="nt-pass"
              type="password"
              required
              minLength={8}
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
            />
          </div>
        </div>

        {error ? <p className="du-alert">{error}</p> : null}

        <div style={{ display: "flex", gap: "var(--ui-sp-3)" }}>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creando…" : "Crear inmobiliaria"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
