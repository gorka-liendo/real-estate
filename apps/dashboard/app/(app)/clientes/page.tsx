"use client";

import { Link2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Select } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, type Client, type ClientSource, type ClientStage } from "@/lib/api";
import { TENANT_SITE_URL } from "@/lib/config";

const STAGE_LABEL: Record<ClientStage, string> = {
  lead: "Contacto",
  active: "Activo",
  closed: "Cerrado",
};
const STAGE_VARIANT: Record<ClientStage, "muted" | "success" | "default"> = {
  lead: "muted",
  active: "success",
  closed: "default",
};

// Etiqueta del origen del lead (Partial: 'manual' no lleva badge a propósito).
// Tipado con el union → una clave con typo es error de compilación.
const SOURCE_LABEL: Partial<Record<ClientSource, string>> = {
  microsite: "Micrositio",
  valuation: "Valoración",
};

function ClientesInner({ slug }: { slug: string }) {
  const { hasModule } = useWorkspace();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Portal del propietario: genera el token y copia el enlace para compartir.
  async function copyPortalLink(c: Client) {
    try {
      const { token } = await api.portal.token(slug, c.id);
      const url = `${TENANT_SITE_URL}/portal/${token}?__tenant=${slug}`;
      await navigator.clipboard.writeText(url);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId((prev) => (prev === c.id ? null : prev)), 2000);
    } catch {
      setError("No se pudo generar el enlace del portal.");
    }
  }

  const load = useCallback(async () => {
    try {
      setClients((await api.clients.list(slug)).clients);
    } catch {
      setError("No se pudieron cargar los clientes.");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    await api.clients.remove(slug, id);
    setClients((prev) => (prev ?? []).filter((c) => c.id !== id));
  }

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="du-h1">Clientes</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} />
          Nuevo cliente
        </Button>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      {showForm ? (
        <NewClientForm
          slug={slug}
          onCreated={(c) => {
            setClients((prev) => [c, ...(prev ?? [])]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      <Card padded={false}>
        {clients === null ? (
          <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
            Cargando…
          </p>
        ) : clients.length === 0 ? (
          <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
            Aún no tienes clientes. Añade el primero con “Nuevo cliente”.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="du-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>
                      <span
                        style={{ display: "inline-flex", alignItems: "center", gap: "var(--ui-sp-2)" }}
                      >
                        {c.name}
                        {SOURCE_LABEL[c.source] ? (
                          <Badge variant="default">{SOURCE_LABEL[c.source]}</Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="du-muted">
                      {c.email || c.phone || "—"}
                    </td>
                    <td>
                      <Badge variant={STAGE_VARIANT[c.stage]}>{STAGE_LABEL[c.stage]}</Badge>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {hasModule("owner_portal") ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void copyPortalLink(c)}
                          aria-label={`Copiar enlace del portal de ${c.name}`}
                        >
                          <Link2 size={15} />
                          {copiedId === c.id ? "¡Copiado!" : "Portal"}
                        </Button>
                      ) : null}{" "}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void remove(c.id)}
                        aria-label={`Eliminar ${c.name}`}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function NewClientForm({
  slug,
  onCreated,
  onCancel,
}: {
  slug: string;
  onCreated: (c: Client) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<ClientStage>("lead");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { client } = await api.clients.create(slug, {
        name,
        email: email || undefined,
        phone: phone || undefined,
        stage,
      });
      onCreated(client);
    } catch {
      setError("No se pudo crear el cliente. Revisa los datos.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} style={{ display: "grid", gap: "var(--ui-sp-4)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--ui-sp-4)",
          }}
        >
          <div>
            <Label htmlFor="c-name">Nombre</Label>
            <Input id="c-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="c-email">Email</Label>
            <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="c-phone">Teléfono</Label>
            <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="c-stage">Estado</Label>
            <Select id="c-stage" value={stage} onChange={(e) => setStage(e.target.value as ClientStage)}>
              <option value="lead">Contacto</option>
              <option value="active">Activo</option>
              <option value="closed">Cerrado</option>
            </Select>
          </div>
        </div>

        {error ? <p className="du-alert">{error}</p> : null}

        <div style={{ display: "flex", gap: "var(--ui-sp-3)" }}>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Guardando…" : "Guardar cliente"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function ClientesPage() {
  const { selected } = useWorkspace();
  const loading = useRequireModule("clients");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <ClientesInner slug={selected.slug} />;
}
