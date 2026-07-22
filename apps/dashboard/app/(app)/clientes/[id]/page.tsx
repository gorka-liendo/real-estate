"use client";

import { CalendarClock, Link2, Plus, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card, Input, Label, Select, Textarea } from "@rep/ui";
import { useSetBreadcrumbs } from "@/contexts/breadcrumbs-context";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, ApiError, type ClientKind, type ClientProfile, type ClientStage } from "@/lib/api";
import { KIND_LABELS } from "@/lib/client-labels";
import { TENANT_SITE_URL } from "@/lib/config";

// Perfil de cliente enriquecido: datos de contacto/facturación, etiquetas, KPIs
// económicos, vínculos (propiedades/contratos), visitas, timeline y notas.

const STAGE_LABELS: Record<ClientStage, string> = { lead: "Contacto", active: "Activo", closed: "Cerrado" };
const LANG_LABELS: Record<string, string> = { es: "Español", en: "Inglés", eu: "Euskera", ca: "Catalán", fr: "Francés", de: "Alemán" };
const VISIT_LABEL: Record<string, string> = { requested: "Pendiente", confirmed: "Confirmada", done: "Hecha", cancelled: "Cancelada" };

const eur = (n: number) => `${new Intl.NumberFormat("es-ES").format(n)} €`;
const eurCents = (c: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(c / 100)} €`;
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

function ProfileInner({ slug, clientId }: { slug: string; clientId: string }) {
  const router = useRouter();
  const { hasModule } = useWorkspace();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [portalMsg, setPortalMsg] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  // Campos editables (contacto + facturación).
  const [form, setForm] = useState({
    email: "", phone: "", secondaryPhone: "", language: "", birthday: "",
    company: "", taxId: "", address: "", fee: "",
  });

  const load = useCallback(async () => {
    try {
      const p = await api.clients.profile(slug, clientId);
      setProfile(p);
      const c = p.client;
      setForm({
        email: c.email ?? "", phone: c.phone ?? "", secondaryPhone: c.secondaryPhone ?? "",
        language: c.language ?? "", birthday: c.birthday ?? "", company: c.company ?? "",
        taxId: c.taxId ?? "", address: c.address ?? "",
        fee: c.monthlyFeeCents != null ? String(c.monthlyFeeCents / 100) : "",
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) router.replace("/clientes");
      else setError("No se pudo cargar el perfil.");
    }
  }, [slug, clientId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useSetBreadcrumbs(
    profile ? [{ label: "Clientes", href: "/clientes" }, { label: profile.client.name }] : null,
  );

  if (!profile) {
    return error ? <p className="du-alert">{error}</p> : <p className="du-muted">Cargando…</p>;
  }
  const c = profile.client;
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function patch(data: Parameters<typeof api.clients.update>[2]) {
    setError(null);
    try {
      await api.clients.update(slug, clientId, data);
      await load();
    } catch {
      setError("No se pudo guardar el cambio.");
    }
  }

  async function saveContact() {
    await patch({
      email: form.email || undefined,
      phone: form.phone || undefined,
      secondaryPhone: form.secondaryPhone || undefined,
      language: form.language || undefined,
      birthday: form.birthday || undefined,
    });
  }
  async function saveBilling() {
    await patch({ company: form.company || undefined, taxId: form.taxId || undefined, address: form.address || undefined });
  }
  async function saveFee() {
    const cents = form.fee.trim() === "" ? null : Math.round(Number(form.fee) * 100);
    if (cents !== null && (!Number.isFinite(cents) || cents < 0)) return setError("Cuota inválida.");
    await patch({ monthlyFeeCents: cents });
  }
  async function addTag() {
    const t = newTag.trim();
    if (!t || c.tags.includes(t)) return setNewTag("");
    setNewTag("");
    await patch({ tags: [...c.tags, t] });
  }
  async function removeTag(t: string) {
    await patch({ tags: c.tags.filter((x) => x !== t) });
  }
  async function addNote() {
    if (!note.trim()) return;
    await api.clients.addNote(slug, clientId, note.trim());
    setNote("");
    await load();
  }
  async function copyPortal() {
    setPortalMsg(null);
    try {
      const { token } = await api.portal.token(slug, clientId);
      await navigator.clipboard.writeText(`${TENANT_SITE_URL}/portal/${token}?__tenant=${slug}`);
      setPortalMsg("Enlace del portal copiado.");
    } catch (err) {
      setPortalMsg(
        err instanceof ApiError && err.message === "no_properties"
          ? "El portal es solo para propietarios (sin inmuebles asignados)."
          : "No se pudo generar el enlace del portal.",
      );
    }
  }

  const activeRent = profile.rentingContracts.find((r) => r.status === "active");
  const fin = profile.finance;

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      {/* Cabecera */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-3)", flexWrap: "wrap" }}>
        <h1 className="du-h1" style={{ margin: 0 }}>{c.name}</h1>
        <Badge variant={c.stage === "active" ? "success" : "muted"}>{STAGE_LABELS[c.stage]}</Badge>
        <Badge variant="default">{KIND_LABELS[c.kind]}</Badge>
        {c.tags.map((t) => (
          <Badge key={t} variant="muted">{t}</Badge>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <Button variant="ghost" size="sm" onClick={() => void copyPortal()}>
            <Link2 size={15} />
            Enlace del portal
          </Button>
        </div>
      </div>
      {portalMsg ? <p className="du-muted" style={{ fontSize: 13, marginTop: -12 }}>{portalMsg}</p> : null}
      {error ? <p className="du-alert">{error}</p> : null}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--ui-sp-4)" }}>
        <Stat label="Facturado" value={eurCents(fin.facturadoCents)} />
        <Stat label="Cobrado" value={eurCents(fin.cobradoCents)} />
        <Stat label="Pendiente" value={eurCents(fin.pendienteCents)} tone={fin.pendienteCents > 0 ? "warning" : "default"} />
        <Stat label="Propiedades" value={String(profile.ownedProperties.length)} />
        <Stat label="Contratos" value={String(profile.rentingContracts.length)} />
        <Stat label="Visitas" value={String(profile.visits.upcoming.length + profile.visits.past.length)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--ui-sp-5)", alignItems: "start" }}>
        {/* Contacto */}
        <Card>
          <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>Contacto</h2>
          <div style={{ display: "grid", gap: "var(--ui-sp-3)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--ui-sp-3)" }}>
              <div><Label htmlFor="f-kind">Tipo</Label>
                <Select id="f-kind" value={c.kind} onChange={(e) => void patch({ kind: e.target.value as ClientKind })}>
                  {Object.entries(KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
              <div><Label htmlFor="f-stage">Estado</Label>
                <Select id="f-stage" value={c.stage} onChange={(e) => void patch({ stage: e.target.value as ClientStage })}>
                  {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
            </div>
            <div><Label htmlFor="f-email">Email</Label>
              <Input id="f-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--ui-sp-3)" }}>
              <div><Label htmlFor="f-phone">Teléfono</Label>
                <Input id="f-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div><Label htmlFor="f-phone2">Teléfono 2</Label>
                <Input id="f-phone2" value={form.secondaryPhone} onChange={(e) => set("secondaryPhone", e.target.value)} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--ui-sp-3)" }}>
              <div><Label htmlFor="f-lang">Idioma</Label>
                <Select id="f-lang" value={form.language} onChange={(e) => set("language", e.target.value)}>
                  <option value="">—</option>
                  {Object.entries(LANG_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
              <div><Label htmlFor="f-bday">Cumpleaños</Label>
                <Input id="f-bday" type="date" value={form.birthday} onChange={(e) => set("birthday", e.target.value)} />
              </div>
            </div>
            <Button size="sm" onClick={() => void saveContact()} style={{ justifySelf: "start" }}>Guardar contacto</Button>
          </div>
        </Card>

        {/* Facturación */}
        <Card>
          <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>Facturación</h2>
          <div style={{ display: "grid", gap: "var(--ui-sp-3)" }}>
            <div><Label htmlFor="f-company">Empresa / razón social</Label>
              <Input id="f-company" value={form.company} onChange={(e) => set("company", e.target.value)} />
            </div>
            <div><Label htmlFor="f-tax">NIF / CIF</Label>
              <Input id="f-tax" value={form.taxId} onChange={(e) => set("taxId", e.target.value)} />
            </div>
            <div><Label htmlFor="f-addr">Dirección</Label>
              <Textarea id="f-addr" rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <Button size="sm" onClick={() => void saveBilling()} style={{ justifySelf: "start" }}>Guardar facturación</Button>

            <div style={{ borderTop: "1px solid var(--ui-border)", paddingTop: "var(--ui-sp-3)" }}>
              <Label htmlFor="f-fee">Cuota mensual (€)</Label>
              <div style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
                <Input id="f-fee" type="number" step="0.01" min="0" placeholder={activeRent ? `${activeRent.monthlyRent} (renta)` : "—"} value={form.fee} onChange={(e) => set("fee", e.target.value)} />
                <Button size="sm" onClick={() => void saveFee()}>Guardar</Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Etiquetas */}
        <Card>
          <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>Etiquetas</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "var(--ui-sp-3)" }}>
            {c.tags.length === 0 ? <span className="du-muted" style={{ fontSize: 13 }}>Sin etiquetas.</span> : null}
            {c.tags.map((t) => (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: "var(--ui-hover)", fontSize: 13 }}>
                {t}
                <button onClick={() => void removeTag(t)} aria-label={`Quitar ${t}`} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ui-muted)", padding: 0, display: "grid" }}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
            <Input placeholder="VIP, inversor, moroso…" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addTag(); } }} />
            <Button variant="outline" size="sm" onClick={() => void addTag()}><Plus size={15} /></Button>
          </div>
        </Card>

        {/* Finanzas */}
        {hasModule("accounting") ? (
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--ui-sp-4)" }}>
              <h2 className="du-h3" style={{ margin: 0 }}>Finanzas</h2>
              <ButtonLink href={`/contabilidad/cliente/${clientId}`} variant="ghost" size="sm">Ver cuenta →</ButtonLink>
            </div>
            {fin.recent.length === 0 ? (
              <p className="du-muted" style={{ margin: 0 }}>Sin facturas todavía.</p>
            ) : (
              fin.recent.map((i, idx) => (
                <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--ui-sp-3)", padding: "var(--ui-sp-2) 0", borderTop: idx > 0 ? "1px solid var(--ui-border)" : "none" }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{i.concept ?? (i.direction === "income" ? "Factura" : "Gasto")}</span>
                    <div className="du-muted" style={{ fontSize: 12 }}>{i.number ? `${i.number} · ` : ""}{fmtDay(i.issueDate)}</div>
                  </div>
                  <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{i.direction === "expense" ? "−" : ""}{eurCents(i.totalCents)}</span>
                </div>
              ))
            )}
          </Card>
        ) : null}

        {/* Vínculos */}
        <Card>
          <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>Vínculos</h2>
          <Label>En propiedad</Label>
          {profile.ownedProperties.length === 0 ? (
            <p className="du-muted" style={{ margin: "4px 0 12px" }}>Sin inmuebles asignados.</p>
          ) : (
            <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
              {profile.ownedProperties.map((p) => (
                <li key={p.id}><Link href={`/propiedades/${p.id}`} style={{ color: "inherit" }}>{p.title}</Link></li>
              ))}
            </ul>
          )}
          <Label>De alquiler (inquilino)</Label>
          {profile.rentingContracts.length === 0 ? (
            <p className="du-muted" style={{ margin: "4px 0 12px" }}>Sin contratos.</p>
          ) : (
            <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
              {profile.rentingContracts.map((r) => (
                <li key={r.rentalId}>
                  <Link href={`/alquileres/${r.rentalId}`} style={{ color: "inherit" }}>{r.propertyTitle}</Link> — {eur(r.monthlyRent)}/mes{" "}
                  <Badge variant={r.status === "active" ? "success" : "default"}>{r.status === "active" ? "Activo" : "Finalizado"}</Badge>
                </li>
              ))}
            </ul>
          )}
          {profile.interestProperty ? (
            <>
              <Label>Interesado en</Label>
              <p style={{ margin: "4px 0 0" }}><Link href={`/propiedades/${profile.interestProperty.id}`} style={{ color: "inherit" }}>{profile.interestProperty.title}</Link></p>
            </>
          ) : null}
        </Card>

        {/* Visitas */}
        <Card>
          <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>Visitas</h2>
          {profile.visits.upcoming.length === 0 && profile.visits.past.length === 0 ? (
            <p className="du-muted" style={{ margin: 0 }}>Sin visitas.</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--ui-sp-2)" }}>
              {[...profile.visits.upcoming, ...profile.visits.past].map((v) => (
                <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--ui-sp-3)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <CalendarClock size={14} className="du-muted" />
                    {v.propertyTitle}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                    <span className="du-muted" style={{ fontSize: 13 }}>{fmtDay(v.at)}</span>
                    <Badge variant={v.status === "done" ? "success" : v.status === "cancelled" ? "muted" : "default"}>{VISIT_LABEL[v.status]}</Badge>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Notas */}
      <Card>
        <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>Notas</h2>
        <div style={{ display: "flex", gap: "var(--ui-sp-2)", marginBottom: "var(--ui-sp-4)" }}>
          <Textarea placeholder="Añadir nota…" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          <Button onClick={() => void addNote()}>Añadir</Button>
        </div>
        {profile.notes.length === 0 ? (
          <p className="du-muted">Sin notas todavía.</p>
        ) : (
          profile.notes.map((n) => (
            <div key={n.id} style={{ borderTop: "1px solid var(--ui-border)", padding: "var(--ui-sp-3) 0" }}>
              <p style={{ margin: 0 }}>{n.body}</p>
              <span className="du-muted" style={{ fontSize: 12 }}>{fmtWhen(n.createdAt)}</span>
            </div>
          ))
        )}
      </Card>

      {/* Actividad */}
      <Card>
        <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>Actividad</h2>
        {profile.timeline.map((t, i) => (
          <div key={`${t.at}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: "var(--ui-sp-4)", borderTop: i > 0 ? "1px solid var(--ui-border)" : "none", padding: "var(--ui-sp-3) 0" }}>
            <span>{t.label}</span>
            <span className="du-muted" style={{ whiteSpace: "nowrap", fontSize: 13 }}>{fmtWhen(t.at)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div style={{ background: "var(--ui-surface)", border: "1px solid var(--ui-border)", borderRadius: "var(--ui-radius-lg)", padding: "var(--ui-sp-4)" }}>
      <div className="du-muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, color: tone === "warning" ? "var(--ui-warning)" : "var(--ui-text)" }}>{value}</div>
    </div>
  );
}

export default function ClientProfilePage() {
  const params = useParams<{ id: string }>();
  const { selected } = useWorkspace();
  const loading = useRequireModule("clients");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <ProfileInner slug={selected.slug} clientId={params.id} />;
}
