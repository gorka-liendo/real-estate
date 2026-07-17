"use client";

import { ImageIcon, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  function updateItem(p: Property) {
    setItems((prev) => (prev ?? []).map((x) => (x.id === p.id ? p : x)));
  }

  async function remove(id: string) {
    await api.properties.remove(slug, id);
    setItems((prev) => (prev ?? []).filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  const selected = (items ?? []).find((p) => p.id === selectedId) ?? null;

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
            setSelectedId(p.id);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {selected ? (
        <PhotoManager
          slug={slug}
          property={selected}
          onChange={updateItem}
          onClose={() => setSelectedId(null)}
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
                  <th style={{ width: 56 }}>Foto</th>
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
                  <tr
                    key={p.id}
                    data-active={p.id === selectedId}
                    onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <Thumb url={p.photos[0]} count={p.photos.length} />
                    </td>
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
                        onClick={(e) => {
                          e.stopPropagation();
                          void remove(p.id);
                        }}
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

function Thumb({ url, count }: { url?: string; count: number }) {
  return (
    <div
      style={{
        position: "relative",
        width: 40,
        height: 40,
        borderRadius: "var(--ui-radius-sm)",
        overflow: "hidden",
        background: "var(--ui-hover)",
        display: "grid",
        placeItems: "center",
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <ImageIcon size={16} color="var(--ui-muted)" />
      )}
      {count > 1 ? (
        <span
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            fontSize: 10,
            fontWeight: 600,
            background: "var(--ui-primary)",
            color: "var(--ui-on-primary)",
            padding: "0 4px",
          }}
        >
          {count}
        </span>
      ) : null}
    </div>
  );
}

function PhotoManager({
  slug,
  property,
  onChange,
  onClose,
}: {
  slug: string;
  property: Property;
  onChange: (p: Property) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let latest = property;
      for (const file of Array.from(files)) {
        latest = (await api.properties.uploadPhoto(slug, property.id, file)).property;
      }
      onChange(latest);
    } catch {
      setError("No se pudo subir la foto (formato jpg/png/webp, máx 8 MB).");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removePhoto(url: string) {
    const { property: updated } = await api.properties.removePhoto(slug, property.id, url);
    onChange(updated);
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="du-h3">Fotos · {property.title}</h2>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar">
          <X size={15} />
        </Button>
      </div>

      {error ? (
        <p className="du-alert" style={{ marginTop: "var(--ui-sp-2)" }}>
          {error}
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: "var(--ui-sp-3)",
          marginTop: "var(--ui-sp-4)",
        }}
      >
        {property.photos.map((url) => (
          <div
            key={url}
            style={{
              position: "relative",
              aspectRatio: "4 / 3",
              borderRadius: "var(--ui-radius)",
              overflow: "hidden",
              background: "var(--ui-hover)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button
              onClick={() => void removePhoto(url)}
              aria-label="Eliminar foto"
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                width: 24,
                height: 24,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            aspectRatio: "4 / 3",
            border: "1px dashed var(--ui-border-strong)",
            borderRadius: "var(--ui-radius)",
            background: "transparent",
            color: "var(--ui-muted)",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            gap: 6,
          }}
        >
          <ImagePlus size={20} />
          <span style={{ fontSize: 12 }}>{busy ? "Subiendo…" : "Añadir fotos"}</span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        hidden
        onChange={(e) => void onFiles(e.target.files)}
      />
    </Card>
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
