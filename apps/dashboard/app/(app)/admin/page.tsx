"use client";

import {
  AlertTriangle,
  Building2,
  CalendarClock,
  ExternalLink,
  Euro,
  Globe,
  KeyRound,
  Landmark,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, ButtonLink, Card, Input, Label, Select, Switch, THEMES } from "@rep/ui";
import { useWorkspace } from "@/contexts/workspace-context";
import { api, ApiError, type AdminTenant, type CatalogModule } from "@/lib/api";
import { DOMAIN_A_RECORD, DOMAIN_CNAME_TARGET, TENANT_SITE_URL } from "@/lib/config";
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

  async function setDomain(tenant: AdminTenant, domain: string | null) {
    setError(null);
    try {
      const res = await api.adminSetDomain(tenant.slug, domain);
      setTenants((prev) =>
        (prev ?? []).map((t) =>
          t.slug === tenant.slug ? { ...t, customDomain: res.customDomain } : t,
        ),
      );
    } catch (err) {
      setError(
        err instanceof ApiError && err.message === "domain_taken"
          ? "Ese dominio ya está asignado a otra inmobiliaria."
          : err instanceof ApiError && err.message === "invalid_domain"
            ? "El dominio no es válido (usa algo como www.tudominio.es, sin http:// ni barras)."
            : `No se pudo actualizar el dominio de ${tenant.name}.`,
      );
      throw err;
    }
  }

  // Resumen de plataforma: derivado de lo que ya cargamos (tenants + catálogo),
  // sin pegar a la API otra vez.
  const summary = useMemo(() => {
    const list = tenants ?? [];
    const priceByCode = new Map(catalog.map((m) => [m.code, m.priceMonthly]));
    const mrrCents = list.reduce(
      (acc, t) => acc + t.activeModules.reduce((a, code) => a + (priceByCode.get(code) ?? 0), 0),
      0,
    );
    const withoutModules = list.filter((t) => t.activeModules.length === 0);
    return {
      tenantCount: list.length,
      mrrCents,
      properties: list.reduce((a, t) => a + t.stats.properties, 0),
      clients: list.reduce((a, t) => a + t.stats.clients, 0),
      withoutModules,
    };
  }, [tenants, catalog]);

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

      {tenants !== null ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--ui-sp-4)",
          }}
        >
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ui-muted)" }}>
              <Landmark size={15} />
              <span style={{ fontSize: 13 }}>Inmobiliarias</span>
            </div>
            <div className="du-h2" style={{ marginTop: 6 }}>
              {summary.tenantCount}
            </div>
          </Card>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ui-muted)" }}>
              <Euro size={15} />
              <span style={{ fontSize: 13 }}>MRR (módulos activos)</span>
            </div>
            <div className="du-h2" style={{ marginTop: 6 }}>
              {eur(summary.mrrCents)}
            </div>
          </Card>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ui-muted)" }}>
              <Users size={15} />
              <span style={{ fontSize: 13 }}>Clientes en la plataforma</span>
            </div>
            <div className="du-h2" style={{ marginTop: 6 }}>
              {summary.clients}
            </div>
          </Card>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ui-muted)" }}>
              <Building2 size={15} />
              <span style={{ fontSize: 13 }}>Inmuebles en la plataforma</span>
            </div>
            <div className="du-h2" style={{ marginTop: 6 }}>
              {summary.properties}
            </div>
          </Card>
        </div>
      ) : null}

      {summary.withoutModules.length > 0 ? (
        <p className="du-alert" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={15} />
          {summary.withoutModules.length === 1
            ? `${summary.withoutModules[0]!.name} no tiene ningún módulo activo.`
            : `${summary.withoutModules.length} inmobiliarias sin ningún módulo activo: ${summary.withoutModules.map((t) => t.name).join(", ")}.`}
        </p>
      ) : null}

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
              {t.activeModules.includes("microsite") ? (
                <Link
                  href={`/admin/tenants/${t.slug}/micrositio`}
                  className="du-btn du-btn--outline du-btn--sm"
                >
                  <Pencil size={14} />
                  Editar micrositio
                </Link>
              ) : null}
              <ButtonLink
                href={`${TENANT_SITE_URL}/?__tenant=${t.slug}`}
                target="_blank"
                variant="ghost"
                size="sm"
              >
                <ExternalLink size={14} />
                Ver
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

            {/* dominio propio */}
            <DomainManager
              slug={t.slug}
              current={t.customDomain}
              onSave={(domain) => setDomain(t, domain)}
            />

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

// Gestión del dominio propio de una inmobiliaria (superadmin). Asignar/quitar +
// instrucciones DNS para relayar al cliente. El HTTPS lo emite la plataforma de
// hosting al verificarse el CNAME (integración de aprovisionamiento: Block 3).
function DomainManager({
  slug,
  current,
  onSave,
}: {
  slug: string;
  current: string | null;
  onSave: (domain: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(current ?? ""), [current]);

  const normalized = value.trim().toLowerCase() || null;
  const dirty = normalized !== (current || null);

  async function save(domain: string | null) {
    setSaving(true);
    try {
      await onSave(domain);
    } catch {
      // el error lo muestra el panel; mantenemos el input para reintentar
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        borderTop: "1px solid var(--ui-border)",
        paddingTop: "var(--ui-sp-4)",
        marginBottom: "var(--ui-sp-4)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: "var(--ui-sp-2)",
          color: "var(--ui-muted)",
          fontSize: 13,
        }}
      >
        <Globe size={14} />
        Dominio propio
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ui-sp-2)", alignItems: "center" }}>
        <Input
          placeholder="www.tudominio.es"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Dominio propio de ${slug}`}
          style={{ maxWidth: 320 }}
        />
        <Button size="sm" disabled={!dirty || saving} onClick={() => void save(normalized)}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        {current ? (
          <Button variant="ghost" size="sm" disabled={saving} onClick={() => void save(null)}>
            Quitar
          </Button>
        ) : null}
      </div>
      {current ? (
        <div className="du-muted" style={{ fontSize: 12, marginTop: "var(--ui-sp-2)", lineHeight: 1.6 }}>
          Activo en <strong>{current}</strong>. En el proveedor de dominio del cliente, configura el
          DNS según sea subdominio o dominio raíz:
          <ul style={{ margin: "var(--ui-sp-2) 0 0", paddingLeft: "1.2em" }}>
            <li>
              Subdominio (p. ej. <code>www.tudominio.es</code>): registro <code>CNAME</code> →{" "}
              <code>{DOMAIN_CNAME_TARGET}</code>
            </li>
            <li>
              Dominio raíz (<code>tudominio.es</code>, el apex no admite CNAME): registro{" "}
              <code>A</code> → <code>{DOMAIN_A_RECORD}</code>
            </li>
          </ul>
          El certificado HTTPS se emite automáticamente al verificarse el DNS. Los valores
          definitivos los confirma la plataforma de hosting al activar el dominio.
        </div>
      ) : (
        <p className="du-muted" style={{ fontSize: 12, marginTop: "var(--ui-sp-2)" }}>
          Sin dominio propio: la web usa el subdominio de la plataforma.
        </p>
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
