"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Select } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import {
  api,
  type Property,
  type PropertyKind,
  type PropertyOperation,
  type PropertyStatus,
} from "@/lib/api";

const KIND_LABEL: Record<PropertyKind, string> = {
  flat: "Piso",
  house: "Casa",
  commercial: "Local",
  land: "Terreno",
  garage: "Garaje",
};
const OPERATION_LABEL: Record<PropertyOperation, string> = { sale: "Venta", rent: "Alquiler" };
const STATUS_LABEL: Record<PropertyStatus, string> = {
  draft: "Borrador",
  published: "Publicada",
  archived: "Archivada",
};
const STATUS_VARIANT: Record<PropertyStatus, "muted" | "success" | "default"> = {
  draft: "muted",
  published: "success",
  archived: "default",
};

function formatPrice(p: Property): string {
  if (p.price == null) return "—";
  const eur = new Intl.NumberFormat("es-ES").format(p.price);
  return p.operation === "rent" ? `${eur} €/mes` : `${eur} €`;
}

function PropiedadesInner({ slug }: { slug: string }) {
  const [items, setItems] = useState<Property[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api.properties.list(slug)).properties);
    } catch {
      setError("No se pudieron cargar las propiedades.");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    await api.properties.remove(slug, id);
    setItems((prev) => (prev ?? []).filter((p) => p.id !== id));
  }

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="du-h1">Propiedades</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} />
          Nueva propiedad
        </Button>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      {showForm ? (
        <NewPropertyForm
          slug={slug}
          onCreated={(p) => {
            setItems((prev) => [p, ...(prev ?? [])]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      <Card padded={false}>
        {items === null ? (
          <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
            Cargando…
          </p>
        ) : items.length === 0 ? (
          <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
            Aún no tienes propiedades. Añade la primera con “Nueva propiedad”.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="du-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th>Operación</th>
                  <th>Precio</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>
                      {p.title}
                      {p.city ? <span className="du-muted"> · {p.city}</span> : null}
                    </td>
                    <td className="du-muted">{KIND_LABEL[p.kind]}</td>
                    <td className="du-muted">{OPERATION_LABEL[p.operation]}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{formatPrice(p)}</td>
                    <td>
                      <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void remove(p.id)}
                        aria-label={`Eliminar ${p.title}`}
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

function NewPropertyForm({
  slug,
  onCreated,
  onCancel,
}: {
  slug: string;
  onCreated: (p: Property) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<PropertyKind>("flat");
  const [operation, setOperation] = useState<PropertyOperation>("sale");
  const [status, setStatus] = useState<PropertyStatus>("draft");
  const [price, setPrice] = useState("");
  const [city, setCity] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { property } = await api.properties.create(slug, {
        title,
        kind,
        operation,
        status,
        price: price ? Number(price) : undefined,
        city: city || undefined,
        areaM2: areaM2 ? Number(areaM2) : undefined,
      });
      onCreated(property);
    } catch {
      setError("No se pudo crear la propiedad. Revisa los datos.");
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
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--ui-sp-4)",
          }}
        >
          <div style={{ gridColumn: "1 / -1" }}>
            <Label htmlFor="p-title">Título</Label>
            <Input id="p-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-kind">Tipo</Label>
            <Select id="p-kind" value={kind} onChange={(e) => setKind(e.target.value as PropertyKind)}>
              {Object.entries(KIND_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="p-op">Operación</Label>
            <Select
              id="p-op"
              value={operation}
              onChange={(e) => setOperation(e.target.value as PropertyOperation)}
            >
              <option value="sale">Venta</option>
              <option value="rent">Alquiler</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="p-price">Precio (€)</Label>
            <Input id="p-price" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-area">Superficie (m²)</Label>
            <Input id="p-area" type="number" min="0" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-city">Ciudad</Label>
            <Input id="p-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-status">Estado</Label>
            <Select id="p-status" value={status} onChange={(e) => setStatus(e.target.value as PropertyStatus)}>
              <option value="draft">Borrador</option>
              <option value="published">Publicada</option>
              <option value="archived">Archivada</option>
            </Select>
          </div>
        </div>

        {error ? <p className="du-alert">{error}</p> : null}

        <div style={{ display: "flex", gap: "var(--ui-sp-3)" }}>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Guardando…" : "Guardar propiedad"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function PropiedadesPage() {
  const { selected } = useWorkspace();
  const loading = useRequireModule("properties");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <PropiedadesInner slug={selected.slug} />;
}
