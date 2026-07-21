"use client";

import { Link2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@rep/ui";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, ApiError, type ClientKind, type ClientProfile, type ClientStage } from "@/lib/api";
import { TENANT_SITE_URL } from "@/lib/config";

// Perfil de cliente: tipo, cuota, roles derivados (propietario/inquilino),
// timeline de actividad y notas del CRM.
import { KIND_LABELS } from "@/lib/client-labels";
const STAGE_LABELS: Record<ClientStage, string> = {
  lead: "Contacto",
  active: "Activo",
  closed: "Cerrado",
};

const eur = (n: number) => `${new Intl.NumberFormat("es-ES").format(n)} €`;
const eurCents = (c: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(c / 100)} €`;
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function ProfileInner({ slug, clientId }: { slug: string; clientId: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [portalMsg, setPortalMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await api.clients.profile(slug, clientId);
      setProfile(p);
      setFee(p.client.monthlyFeeCents != null ? String(p.client.monthlyFeeCents / 100) : "");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) router.replace("/clientes");
      else setError("No se pudo cargar el perfil.");
    }
  }, [slug, clientId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!profile) {
    return error ? <p className="du-alert">{error}</p> : <p className="du-muted">Cargando…</p>;
  }
  const c = profile.client;

  async function patch(data: Parameters<typeof api.clients.update>[2]) {
    setError(null);
    try {
      await api.clients.update(slug, clientId, data);
      await load();
    } catch {
      setError("No se pudo guardar el cambio.");
    }
  }

  async function saveFee() {
    const cents = fee.trim() === "" ? null : Math.round(Number(fee) * 100);
    if (cents !== null && (!Number.isFinite(cents) || cents < 0)) {
      setError("Cuota inválida.");
      return;
    }
    await patch({ monthlyFeeCents: cents });
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
          ? "Este cliente no tiene inmuebles asignados: el portal es solo para propietarios."
          : "No se pudo generar el enlace del portal.",
      );
    }
  }

  // Cuota de referencia: la manual, o la renta del contrato activo si es inquilino.
  const activeRent = profile.rentingContracts.find((r) => r.status === "active");

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div>
        <Breadcrumbs items={[{ label: "Clientes", href: "/clientes" }, { label: c.name }]} />
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-3)", flexWrap: "wrap" }}>
          <h1 className="du-h1" style={{ margin: 0 }}>
            {c.name}
          </h1>
          <Badge variant={c.stage === "active" ? "success" : "muted"}>{STAGE_LABELS[c.stage]}</Badge>
        </div>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      <Card>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--ui-sp-4)",
            alignItems: "end",
          }}
        >
          <div>
            <Label>Contacto</Label>
            <p style={{ margin: "6px 0 0" }}>
              {c.email ?? "—"}
              <br />
              <span className="du-muted">{c.phone ?? ""}</span>
            </p>
          </div>
          <div>
            <Label htmlFor="p-kind">Tipo de cliente</Label>
            <Select
              id="p-kind"
              value={c.kind}
              onChange={(e) => void patch({ kind: e.target.value as ClientKind })}
            >
              {Object.entries(KIND_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="p-stage">Estado</Label>
            <Select
              id="p-stage"
              value={c.stage}
              onChange={(e) => void patch({ stage: e.target.value as ClientStage })}
            >
              {Object.entries(STAGE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="p-fee">Cuota mensual (€)</Label>
            <div style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
              <Input
                id="p-fee"
                type="number"
                step="0.01"
                min="0"
                placeholder={activeRent ? `${activeRent.monthlyRent} (renta)` : "—"}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
              <Button size="sm" onClick={() => void saveFee()}>
                Guardar
              </Button>
            </div>
          </div>
          <div>
            <Button variant="ghost" onClick={() => void copyPortal()}>
              <Link2 size={15} />
              Enlace del portal
            </Button>
            {portalMsg ? (
              <p className="du-muted" style={{ fontSize: 12, marginTop: 4 }}>
                {portalMsg}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "var(--ui-sp-5)",
          alignItems: "start",
        }}
      >
        <Card>
          <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
            Vínculos
          </h2>
          <Label>En propiedad</Label>
          {profile.ownedProperties.length === 0 ? (
            <p className="du-muted" style={{ margin: "4px 0 12px" }}>
              Sin inmuebles asignados.
            </p>
          ) : (
            <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
              {profile.ownedProperties.map((p) => (
                <li key={p.id}>{p.title}</li>
              ))}
            </ul>
          )}
          <Label>De alquiler (inquilino)</Label>
          {profile.rentingContracts.length === 0 ? (
            <p className="du-muted" style={{ margin: "4px 0 12px" }}>
              Sin contratos.
            </p>
          ) : (
            <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
              {profile.rentingContracts.map((r) => (
                <li key={r.rentalId}>
                  {r.propertyTitle} — {eur(r.monthlyRent)}/mes{" "}
                  <Badge variant={r.status === "active" ? "success" : "default"}>
                    {r.status === "active" ? "Activo" : "Finalizado"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {profile.interestProperty ? (
            <>
              <Label>Interesado en</Label>
              <p style={{ margin: "4px 0 0" }}>{profile.interestProperty.title}</p>
            </>
          ) : null}
          {c.monthlyFeeCents != null ? (
            <p className="du-muted" style={{ marginTop: 12, fontSize: 13 }}>
              Cuota acordada: <strong>{eurCents(c.monthlyFeeCents)}/mes</strong>
            </p>
          ) : null}
        </Card>

        <Card>
          <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
            Notas
          </h2>
          <div style={{ display: "flex", gap: "var(--ui-sp-2)", marginBottom: "var(--ui-sp-4)" }}>
            <Textarea
              placeholder="Añadir nota…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
            <Button onClick={() => void addNote()}>Añadir</Button>
          </div>
          {profile.notes.length === 0 ? (
            <p className="du-muted">Sin notas todavía.</p>
          ) : (
            profile.notes.map((n) => (
              <div
                key={n.id}
                style={{
                  borderTop: "1px solid var(--ui-border)",
                  padding: "var(--ui-sp-3) 0",
                }}
              >
                <p style={{ margin: 0 }}>{n.body}</p>
                <span className="du-muted" style={{ fontSize: 12 }}>
                  {fmtWhen(n.createdAt)}
                </span>
              </div>
            ))
          )}
        </Card>
      </div>

      <Card>
        <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
          Actividad
        </h2>
        {profile.timeline.map((t, i) => (
          <div
            key={`${t.at}-${i}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--ui-sp-4)",
              borderTop: i > 0 ? "1px solid var(--ui-border)" : "none",
              padding: "var(--ui-sp-3) 0",
            }}
          >
            <span>{t.label}</span>
            <span className="du-muted" style={{ whiteSpace: "nowrap", fontSize: 13 }}>
              {fmtWhen(t.at)}
            </span>
          </div>
        ))}
      </Card>
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
