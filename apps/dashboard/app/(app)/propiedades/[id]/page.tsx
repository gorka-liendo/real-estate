"use client";

import { ArrowLeft, CheckCircle, DoorOpen, ExternalLink, ImageIcon, Pencil, RotateCcw, User } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card, Label } from "@rep/ui";
import { useSetBreadcrumbs } from "@/contexts/breadcrumbs-context";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, ApiError, type Client, type Invoice, type Property, type Rental } from "@/lib/api";
import { TENANT_SITE_URL } from "@/lib/config";
import { CONDITIONS, PROPERTY_FEATURES } from "@/lib/property-meta";
import {
  formatPrice,
  KIND_LABEL,
  PhotoManager,
  PropertyForm,
  STATUS_LABEL,
  STATUS_VARIANT,
} from "../_shared";

const eur = (n: number) => `${new Intl.NumberFormat("es-ES").format(n)} €`;
const eurCents = (c: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(c / 100)} €`;

const CONDITION_LABEL = Object.fromEntries(CONDITIONS.map((c) => [c.id, c.label]));
const FEATURE_LABEL = Object.fromEntries(PROPERTY_FEATURES.map((f) => [f.id, f.label]));
const currentYear = new Date().getFullYear();

function PropertyDetailInner({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  const { hasModule } = useWorkspace();
  const [property, setProperty] = useState<Property | null>(null);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [owner, setOwner] = useState<Client | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { properties } = await api.properties.list(slug);
      const p = properties.find((x) => x.id === id) ?? null;
      if (!p) {
        router.replace("/propiedades");
        return;
      }
      setProperty(p);
      if (hasModule("rentals")) {
        setRentals((await api.rentals.list(slug)).rentals.filter((r) => r.propertyId === id));
      }
      if (hasModule("accounting")) {
        setInvoices((await api.invoices.list(slug, { propertyId: id })).invoices);
      }
      if (p.ownerClientId && hasModule("clients")) {
        const { clients } = await api.clients.list(slug);
        setOwner(clients.find((c) => c.id === p.ownerClientId) ?? null);
      } else {
        setOwner(null);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) router.replace("/propiedades");
      else setError("No se pudo cargar la propiedad.");
    }
  }, [slug, id, hasModule, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useSetBreadcrumbs(
    property
      ? [{ label: "Propiedades", href: "/propiedades" }, { label: property.title }]
      : null,
  );

  async function setStatus(status: Property["status"]) {
    if (!property) return;
    setError(null);
    try {
      const { property: updated } = await api.properties.update(slug, property.id, { status });
      setProperty(updated);
    } catch {
      setError("No se pudo actualizar el estado.");
    }
  }

  if (!property) {
    return error ? <p className="du-alert">{error}</p> : <p className="du-muted">Cargando…</p>;
  }
  const p = property;
  const d = p.details ?? {};

  // Rentabilidad del año en curso.
  const yearStr = String(currentYear);
  const rentIncomeCents =
    rentals
      .flatMap((r) => r.payments)
      .filter((pay) => pay.status === "paid" && pay.period.startsWith(yearStr))
      .reduce((a, pay) => a + pay.amount, 0) * 100;
  const feeIncomeCents = invoices
    .filter((i) => i.direction === "income" && i.issueDate.startsWith(yearStr))
    .reduce((a, i) => a + i.paidCents, 0);
  const incomeCents = rentIncomeCents + feeIncomeCents;
  const expensesCents = invoices
    .filter((i) => i.direction === "expense" && i.issueDate.startsWith(yearStr) && i.status !== "cancelled")
    .reduce((a, i) => a + i.totalCents, 0);
  const netCents = incomeCents - expensesCents;

  // Estado de alquiler.
  const active = rentals.filter((r) => r.status === "active");
  const byRoom = active.some((r) => r.roomId);
  const totalRent = active.reduce((s, r) => s + r.monthlyRent, 0);

  // Datos rápidos.
  const facts: Array<{ k: string; v: string }> = [];
  facts.push({ k: "Precio", v: formatPrice(p) });
  if (p.areaM2) facts.push({ k: "Superficie", v: `${p.areaM2} m²` });
  if (p.bedrooms != null) facts.push({ k: "Habitaciones", v: String(p.bedrooms) });
  if (p.bathrooms != null) facts.push({ k: "Baños", v: String(p.bathrooms) });
  facts.push({ k: "Tipo", v: KIND_LABEL[p.kind] });
  if (d.floor) facts.push({ k: "Planta", v: d.floor });
  if (d.condition) facts.push({ k: "Estado", v: CONDITION_LABEL[d.condition] ?? d.condition });
  if (d.yearBuilt) facts.push({ k: "Año", v: String(d.yearBuilt) });
  if (d.energyCert) facts.push({ k: "Cert. energético", v: d.energyCert });

  if (editing) {
    return (
      <div style={{ display: "grid", gap: "var(--ui-sp-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-3)" }}>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            <ArrowLeft size={15} />
            Volver al detalle
          </Button>
          <h1 className="du-h1" style={{ margin: 0 }}>
            Editar propiedad
          </h1>
        </div>
        <PropertyForm
          slug={slug}
          initial={p}
          onSaved={(updated) => {
            setProperty(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
        <PhotoManager slug={slug} property={p} onChange={setProperty} onClose={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-3)", flexWrap: "wrap" }}>
        <h1 className="du-h1" style={{ margin: 0 }}>
          {p.title}
        </h1>
        <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
        <div style={{ marginLeft: "auto", display: "flex", gap: "var(--ui-sp-2)", flexWrap: "wrap" }}>
            {p.status === "published" ? (
              <a
                className="du-btn du-btn--ghost du-btn--sm"
                href={`${TENANT_SITE_URL}/propiedad/${p.id}?__tenant=${slug}`}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <ExternalLink size={15} />
                Ver en micrositio
              </a>
            ) : null}
            {/* Acción rápida de venta (solo inmuebles en venta) */}
            {p.operation === "sale" && p.status !== "sold" ? (
              <Button variant="outline" size="sm" onClick={() => void setStatus("sold")}>
                <CheckCircle size={15} />
                Marcar como vendida
              </Button>
            ) : null}
            {p.status === "sold" ? (
              <Button variant="outline" size="sm" onClick={() => void setStatus("published")}>
                <RotateCcw size={15} />
                Reabrir
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil size={15} />
              Editar
            </Button>
        </div>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "var(--ui-sp-5)",
          alignItems: "start",
        }}
      >
        {/* Columna principal: fotos + datos + descripción */}
        <div style={{ display: "grid", gap: "var(--ui-sp-4)" }}>
          <div
            style={{
              position: "relative",
              aspectRatio: "16 / 10",
              borderRadius: "var(--ui-radius-lg)",
              overflow: "hidden",
              background: "var(--ui-hover)",
              display: "grid",
              placeItems: "center",
            }}
          >
            {p.photos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <ImageIcon size={28} color="var(--ui-muted)" />
            )}
          </div>
          {p.photos.length > 1 ? (
            <div style={{ display: "flex", gap: "var(--ui-sp-2)", flexWrap: "wrap" }}>
              {p.photos.slice(1, 6).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt=""
                  style={{ width: 72, height: 54, objectFit: "cover", borderRadius: "var(--ui-radius-sm)" }}
                />
              ))}
            </div>
          ) : null}

          <Card>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: "var(--ui-sp-4)",
              }}
            >
              {facts.map((f) => (
                <div key={f.k}>
                  <Label>{f.k}</Label>
                  <p style={{ margin: "2px 0 0", fontWeight: 500 }}>{f.v}</p>
                </div>
              ))}
            </div>
            {p.features.length > 0 ? (
              <div style={{ marginTop: "var(--ui-sp-4)", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {p.features.map((f) => (
                  <Badge key={f} variant="default">
                    {FEATURE_LABEL[f] ?? f}
                  </Badge>
                ))}
              </div>
            ) : null}
            {p.description ? (
              <p style={{ marginTop: "var(--ui-sp-4)", marginBottom: 0, color: "var(--ui-muted)", lineHeight: 1.6 }}>
                {p.description}
              </p>
            ) : null}
          </Card>
        </div>

        {/* Aside: rentabilidad + alquiler + propietario */}
        <div style={{ display: "grid", gap: "var(--ui-sp-4)" }}>
          {/* Estado de alquiler */}
          <Card>
            <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-3)" }}>
              Estado de alquiler
            </h2>
            {p.operation !== "rent" ? (
              <p className="du-muted" style={{ margin: 0 }}>
                Inmueble en venta ({formatPrice(p)}).
              </p>
            ) : active.length === 0 ? (
              <div>
                <Badge variant="muted">Libre</Badge>
                <p className="du-muted" style={{ margin: "var(--ui-sp-2) 0 0", fontSize: 13 }}>
                  Sin contrato de alquiler activo.
                </p>
                {hasModule("rentals") ? (
                  <div style={{ marginTop: "var(--ui-sp-3)" }}>
                    <ButtonLink href="/alquileres" variant="outline" size="sm">
                      Crear contrato
                    </ButtonLink>
                  </div>
                ) : null}
              </div>
            ) : byRoom ? (
              <div>
                <Badge variant="success">
                  <DoorOpen size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
                  Por habitaciones
                </Badge>
                <p style={{ margin: "var(--ui-sp-2) 0 0" }}>
                  <strong>{active.length}</strong> habitaci{active.length === 1 ? "ón" : "ones"} alquilada
                  {active.length === 1 ? "" : "s"} · <strong>{eur(totalRent)}</strong>/mes
                </p>
                <div style={{ marginTop: "var(--ui-sp-3)" }}>
                  <ButtonLink href={`/alquileres/propiedad/${p.id}`} variant="outline" size="sm">
                    Ver piso y habitaciones →
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <div>
                <Badge variant="success">Alquilado</Badge>
                <p style={{ margin: "var(--ui-sp-2) 0 0" }}>
                  {active[0]!.renterName} · <strong>{eur(active[0]!.monthlyRent)}</strong>/mes
                </p>
                <div style={{ marginTop: "var(--ui-sp-3)" }}>
                  <ButtonLink href={`/alquileres/${active[0]!.id}`} variant="outline" size="sm">
                    Gestionar contrato →
                  </ButtonLink>
                </div>
              </div>
            )}
          </Card>

          {/* Rentabilidad */}
          {hasModule("accounting") ? (
            <Card>
              <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-3)" }}>
                Rentabilidad {currentYear}
              </h2>
              <div style={{ display: "grid", gap: "var(--ui-sp-2)" }}>
                <Row label="Ingresos" value={eurCents(incomeCents)} />
                <Row label="Gastos" value={expensesCents > 0 ? `−${eurCents(expensesCents)}` : eurCents(0)} />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: "var(--ui-sp-2)",
                    borderTop: "1px solid var(--ui-border)",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>Neto</span>
                  <span style={{ fontWeight: 700, color: netCents >= 0 ? "var(--ui-success)" : "var(--ui-danger)" }}>
                    {eurCents(netCents)}
                  </span>
                </div>
              </div>
              <div style={{ marginTop: "var(--ui-sp-3)" }}>
                <ButtonLink href={`/contabilidad/inmueble/${p.id}`} variant="ghost" size="sm">
                  Ver contabilidad →
                </ButtonLink>
              </div>
            </Card>
          ) : null}

          {/* Propietario */}
          <Card>
            <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-3)" }}>
              Propietario
            </h2>
            {owner ? (
              <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <User size={14} className="du-muted" />
                <Link href={`/clientes/${owner.id}`} style={{ color: "inherit", textDecoration: "underline" }}>
                  {owner.name}
                </Link>
              </p>
            ) : (
              <p className="du-muted" style={{ margin: 0, fontSize: 13 }}>
                Sin propietario asignado. Asígnalo al editar la propiedad.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span className="du-muted" style={{ fontSize: 14 }}>
        {label}
      </span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const { selected } = useWorkspace();
  const loading = useRequireModule("properties");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <PropertyDetailInner slug={selected.slug} id={params.id} />;
}
