"use client";

import { FileVideo, ImageIcon, ImagePlus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@rep/ui";
import { useWorkspace } from "@/contexts/workspace-context";
import {
  api,
  type Client,
  type Property,
  type PropertyDetails,
  type PropertyKind,
  type PropertyOperation,
  type PropertyStatus,
} from "@/lib/api";
import { CONDITIONS, PROPERTY_FEATURES, SUBTYPES } from "@/lib/property-meta";

// Piezas compartidas de Propiedades: etiquetas, formato de precio, gestor de
// fotos/vídeos y formulario de alta/edición. Usadas por el listado y el detalle.

export const KIND_LABEL: Record<PropertyKind, string> = {
  flat: "Piso",
  house: "Casa",
  commercial: "Local",
  land: "Terreno",
  garage: "Garaje",
};
export const OPERATION_LABEL: Record<PropertyOperation, string> = { sale: "Venta", rent: "Alquiler" };
export const STATUS_LABEL: Record<PropertyStatus, string> = {
  draft: "Borrador",
  published: "Publicada",
  archived: "Archivada",
};
export const STATUS_VARIANT: Record<PropertyStatus, "muted" | "success" | "default"> = {
  draft: "muted",
  published: "success",
  archived: "default",
};

export function formatPrice(p: Property): string {
  if (p.price == null) return "—";
  const eur = new Intl.NumberFormat("es-ES").format(p.price);
  return p.operation === "rent" ? `${eur} €/mes` : `${eur} €`;
}

export function Thumb({ url, count }: { url?: string; count: number }) {
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

export function PhotoManager({
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
  const videoRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
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

  async function onVideoFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setVideoBusy(true);
    setError(null);
    try {
      let latest = property;
      for (const file of Array.from(files)) {
        latest = (await api.properties.uploadVideo(slug, property.id, file)).property;
      }
      onChange(latest);
    } catch {
      setError("No se pudo subir el vídeo (mp4/webm/mov, máx 200 MB).");
    } finally {
      setVideoBusy(false);
      if (videoRef.current) videoRef.current.value = "";
    }
  }

  async function removePhoto(url: string) {
    const { property: updated } = await api.properties.removePhoto(slug, property.id, url);
    onChange(updated);
  }

  async function removeVideo(url: string) {
    const { property: updated } = await api.properties.removeVideo(slug, property.id, url);
    onChange(updated);
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="du-h3">Fotos y vídeos · {property.title}</h2>
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

      <h3 className="du-h3" style={{ marginTop: "var(--ui-sp-5)", marginBottom: "var(--ui-sp-3)" }}>
        Vídeos
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "var(--ui-sp-3)",
        }}
      >
        {property.videos.map((url) => (
          <div key={url} style={{ position: "relative" }}>
            <video
              src={url}
              controls
              style={{
                width: "100%",
                aspectRatio: "16 / 9",
                borderRadius: "var(--ui-radius)",
                background: "#000",
                objectFit: "cover",
              }}
            />
            <button
              onClick={() => void removeVideo(url)}
              aria-label="Eliminar vídeo"
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
          onClick={() => videoRef.current?.click()}
          disabled={videoBusy}
          style={{
            aspectRatio: "16 / 9",
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
          <FileVideo size={20} />
          <span style={{ fontSize: 12 }}>{videoBusy ? "Subiendo…" : "Añadir vídeo"}</span>
        </button>
      </div>
      <input
        ref={videoRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        multiple
        hidden
        onChange={(e) => void onVideoFiles(e.target.files)}
      />
    </Card>
  );
}

export function PropertyForm({
  slug,
  initial,
  onSaved,
  onCancel,
}: {
  slug: string;
  initial?: Property;
  onSaved: (p: Property) => void;
  onCancel: () => void;
}) {
  const isEdit = initial != null;
  const d0 = initial?.details ?? {};
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<PropertyKind>(initial?.kind ?? "flat");
  const [operation, setOperation] = useState<PropertyOperation>(initial?.operation ?? "sale");
  const [status, setStatus] = useState<PropertyStatus>(initial?.status ?? "draft");
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [province, setProvince] = useState(d0.province ?? "");
  const [areaM2, setAreaM2] = useState(initial?.areaM2 != null ? String(initial.areaM2) : "");
  const [bedrooms, setBedrooms] = useState(initial?.bedrooms != null ? String(initial.bedrooms) : "");
  const [bathrooms, setBathrooms] = useState(
    initial?.bathrooms != null ? String(initial.bathrooms) : "",
  );
  const [subtype, setSubtype] = useState(d0.subtype ?? "");
  const [condition, setCondition] = useState<string>(d0.condition ?? "");
  const [floor, setFloor] = useState(d0.floor ?? "");
  const [yearBuilt, setYearBuilt] = useState(d0.yearBuilt != null ? String(d0.yearBuilt) : "");
  const [energyCert, setEnergyCert] = useState(d0.energyCert ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [features, setFeatures] = useState<string[]>(initial?.features ?? []);
  const [ownerClientId, setOwnerClientId] = useState(initial?.ownerClientId ?? "");
  const [ownerOptions, setOwnerOptions] = useState<Client[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { hasModule } = useWorkspace();

  // Propietario = cliente del CRM (para el portal del propietario).
  useEffect(() => {
    if (!hasModule("clients")) return;
    void api.clients.list(slug).then(({ clients }) => setOwnerOptions(clients)).catch(() => {});
  }, [slug, hasModule]);

  function toggleFeature(id: string) {
    setFeatures((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  }

  const num = (v: string) => (v ? Number(v) : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Conserva campos de details que no edita el formulario (referencia,
      // barrio, coordenadas…) haciendo spread del original.
      const details: PropertyDetails = {
        ...d0,
        subtype: subtype || undefined,
        condition: (condition || undefined) as PropertyDetails["condition"],
        floor: floor || undefined,
        yearBuilt: num(yearBuilt),
        energyCert: energyCert || undefined,
        province: province || undefined,
      };
      const payload = {
        title,
        kind,
        operation,
        status,
        price: num(price),
        city: city || undefined,
        areaM2: num(areaM2),
        bedrooms: num(bedrooms),
        bathrooms: num(bathrooms),
        description: description || undefined,
        features,
        details,
        ownerClientId: ownerClientId || null,
      };
      const { property } = isEdit
        ? await api.properties.update(slug, initial.id, payload)
        : await api.properties.create(slug, payload);
      onSaved(property);
    } catch {
      setError(
        isEdit
          ? "No se pudieron guardar los cambios. Revisa los datos."
          : "No se pudo crear la propiedad. Revisa los datos.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const fieldGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "var(--ui-sp-4)",
  } as const;

  return (
    <Card>
      <form onSubmit={submit} style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
        <div>
          <Label htmlFor="p-title">Título</Label>
          <Input id="p-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {ownerOptions !== null ? (
          <div>
            <Label htmlFor="p-owner">Propietario (cliente del CRM)</Label>
            <Select
              id="p-owner"
              value={ownerClientId}
              onChange={(e) => setOwnerClientId(e.target.value)}
            >
              <option value="">— Sin propietario —</option>
              {ownerOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.email ? ` · ${c.email}` : ""}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div style={fieldGrid}>
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
            <Label htmlFor="p-subtype">Subtipo</Label>
            <Select id="p-subtype" value={subtype} onChange={(e) => setSubtype(e.target.value)}>
              <option value="">—</option>
              {SUBTYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="p-op">Operación</Label>
            <Select id="p-op" value={operation} onChange={(e) => setOperation(e.target.value as PropertyOperation)}>
              <option value="sale">Venta</option>
              <option value="rent">Alquiler</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="p-price">Precio (€)</Label>
            <Input id="p-price" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
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

        <div style={fieldGrid}>
          <div>
            <Label htmlFor="p-area">Superficie (m²)</Label>
            <Input id="p-area" type="number" min="0" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-bed">Habitaciones</Label>
            <Input id="p-bed" type="number" min="0" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-bath">Baños</Label>
            <Input id="p-bath" type="number" min="0" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-floor">Planta</Label>
            <Input id="p-floor" placeholder="3, Bajo, Ático…" value={floor} onChange={(e) => setFloor(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-cond">Estado conservación</Label>
            <Select id="p-cond" value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="">—</option>
              {CONDITIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="p-energy">Cert. energético</Label>
            <Select id="p-energy" value={energyCert} onChange={(e) => setEnergyCert(e.target.value)}>
              <option value="">—</option>
              {["A", "B", "C", "D", "E", "F", "G"].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="p-year">Año construcción</Label>
            <Input id="p-year" type="number" min="1800" max="2100" value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-city">Ciudad</Label>
            <Input id="p-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-prov">Provincia</Label>
            <Input id="p-prov" value={province} onChange={(e) => setProvince(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="p-desc">Descripción</Label>
          <Textarea
            id="p-desc"
            placeholder="Describe la propiedad: luz, reformas, ubicación, extras…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ minHeight: 120 }}
          />
        </div>

        <div>
          <Label>Características</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ui-sp-3)", marginTop: "var(--ui-sp-2)" }}>
            {PROPERTY_FEATURES.map((f) => (
              <label
                key={f.id}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={features.includes(f.id)}
                  onChange={() => toggleFeature(f.id)}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        {error ? <p className="du-alert">{error}</p> : null}

        <div style={{ display: "flex", gap: "var(--ui-sp-3)" }}>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar propiedad"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
