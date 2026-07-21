"use client";

import { ImageIcon, KeyRound, MapPin, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, type Property, type Rental } from "@/lib/api";
import {
  formatPrice,
  KIND_LABEL,
  OPERATION_LABEL,
  PropertyForm,
  STATUS_LABEL,
  STATUS_VARIANT,
} from "./_shared";

function PropiedadesInner({ slug }: { slug: string }) {
  const router = useRouter();
  const { hasModule } = useWorkspace();
  const [items, setItems] = useState<Property[] | null>(null);
  const [rentedIds, setRentedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api.properties.list(slug)).properties);
      if (hasModule("rentals")) {
        const { rentals } = await api.rentals.list(slug);
        setRentedIds(new Set(rentals.filter((r) => r.status === "active").map((r: Rental) => r.propertyId)));
      }
    } catch {
      setError("No se pudieron cargar las propiedades.");
    }
  }, [slug, hasModule]);

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
        <h1 className="du-h1" style={{ margin: 0 }}>
          Propiedades
        </h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} />
          Nueva propiedad
        </Button>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      {showForm ? (
        <PropertyForm
          slug={slug}
          onSaved={(p) => {
            setShowForm(false);
            router.push(`/propiedades/${p.id}`);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {items === null ? (
        <p className="du-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: "var(--ui-sp-6) 0" }}>
            <KeyRound size={28} color="var(--ui-muted)" />
            <p style={{ margin: "var(--ui-sp-3) 0 var(--ui-sp-4)" }}>Aún no tienes propiedades.</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus size={16} />
              Añadir la primera
            </Button>
          </div>
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--ui-sp-4)",
          }}
        >
          {items.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              rented={rentedIds.has(p.id)}
              onRemove={() => void remove(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PropertyCard({
  property: p,
  rented,
  onRemove,
}: {
  property: Property;
  rented: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--ui-surface)",
        border: "1px solid var(--ui-border)",
        borderRadius: "var(--ui-radius-lg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "var(--ui-shadow-sm)",
      }}
    >
      <Link href={`/propiedades/${p.id}`} style={{ display: "block" }}>
        <div
          style={{
            position: "relative",
            height: 160,
            overflow: "hidden",
            background: "var(--ui-hover)",
            display: "grid",
            placeItems: "center",
          }}
        >
          {p.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.photos[0]}
              alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <ImageIcon size={22} color="var(--ui-muted)" />
          )}
          <span style={{ position: "absolute", top: "var(--ui-sp-3)", left: "var(--ui-sp-3)" }}>
            <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
          </span>
          {p.operation === "rent" ? (
            <span style={{ position: "absolute", top: "var(--ui-sp-3)", right: "var(--ui-sp-3)" }}>
              <Badge variant={rented ? "success" : "muted"}>{rented ? "Alquilado" : "Libre"}</Badge>
            </span>
          ) : null}
        </div>
      </Link>

      <div style={{ padding: "var(--ui-sp-4)", display: "grid", gap: "var(--ui-sp-2)", flex: 1 }}>
        <Link
          href={`/propiedades/${p.id}`}
          style={{ color: "inherit", textDecoration: "none", fontWeight: 600, fontSize: 16 }}
        >
          {p.title}
        </Link>
        <div className="du-muted" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
          {p.city ? (
            <>
              <MapPin size={12} />
              {p.city}
              {" · "}
            </>
          ) : null}
          {KIND_LABEL[p.kind]} · {OPERATION_LABEL[p.operation]}
        </div>
        <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatPrice(p)}</div>
      </div>

      <div
        style={{
          borderTop: "1px solid var(--ui-border)",
          padding: "var(--ui-sp-2) var(--ui-sp-3)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <ButtonLink href={`/propiedades/${p.id}`} variant="ghost" size="sm">
          Ver detalle →
        </ButtonLink>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Eliminar ${p.title}`}>
          <Trash2 size={15} />
        </Button>
      </div>
    </div>
  );
}

export default function PropiedadesPage() {
  const { selected } = useWorkspace();
  const loading = useRequireModule("properties");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <PropiedadesInner slug={selected.slug} />;
}
