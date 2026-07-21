"use client";

import { Check, DoorOpen } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, ButtonLink, Card } from "@rep/ui";
import { useSetBreadcrumbs } from "@/contexts/breadcrumbs-context";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, type Property, type Rental } from "@/lib/api";

// Vista de un inmueble alquilado por habitaciones: todas sus habitaciones y
// contratos en un solo sitio. Cada habitación enlaza a la gestión del contrato.

const eur = (n: number) => `${new Intl.NumberFormat("es-ES").format(n)} €`;
const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function periodAgo(n: number): string {
  const d = new Date();
  const x = new Date(d.getFullYear(), d.getMonth() - n, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}
const periodShort = (p: string) => MONTH_SHORT[Number(p.slice(5)) - 1]!;
const paymentFor = (r: Rental, period: string) => r.payments.find((p) => p.period.startsWith(period));

function PropertyRentalsInner({ slug, propertyId }: { slug: string; propertyId: string }) {
  const [rentals, setRentals] = useState<Rental[] | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = (await api.rentals.list(slug)).rentals.filter((r) => r.propertyId === propertyId);
      setRentals(all);
      const { properties } = await api.properties.list(slug);
      setProperty(properties.find((p) => p.id === propertyId) ?? null);
    } catch {
      setError("No se pudo cargar el inmueble.");
    }
  }, [slug, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useSetBreadcrumbs([
    { label: "Alquileres", href: "/alquileres" },
    { label: property?.title ?? "Inmueble" },
  ]);

  async function togglePayment(r: Rental, period: string) {
    setError(null);
    const next = paymentFor(r, period)?.status === "paid" ? "pending" : "paid";
    try {
      await api.rentals.setPayment(slug, r.id, period, next);
      await load();
    } catch {
      setError("No se pudo registrar el cobro.");
    }
  }

  if (rentals === null) {
    return error ? <p className="du-alert">{error}</p> : <p className="du-muted">Cargando…</p>;
  }

  const currentPeriod = periodAgo(0);
  const active = rentals.filter((r) => r.status === "active");
  const ended = rentals.filter((r) => r.status === "ended");
  const totalRent = active.reduce((s, r) => s + r.monthlyRent, 0);
  const collectedThisMonth = active.reduce((s, r) => {
    const pay = paymentFor(r, currentPeriod);
    return pay?.status === "paid" ? s + (pay.amount ?? r.monthlyRent) : s;
  }, 0);
  const pendingThisMonth = active.filter((r) => paymentFor(r, currentPeriod)?.status !== "paid").length;

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-3)", flexWrap: "wrap" }}>
        <h1 className="du-h1" style={{ margin: 0 }}>
          {property?.title ?? "Inmueble"}
        </h1>
        <Badge variant="muted">
          <DoorOpen size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          Por habitaciones
        </Badge>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      {/* Resumen del inmueble */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "var(--ui-sp-4)",
        }}
      >
        <StatCard label="Habitaciones alquiladas" value={String(active.length)} />
        <StatCard label="Renta total" value={`${eur(totalRent)}/mes`} />
        <StatCard label={`Cobrado ${periodShort(currentPeriod)}.`} value={eur(collectedThisMonth)} />
        <StatCard
          label={`Pendiente ${periodShort(currentPeriod)}.`}
          value={String(pendingThisMonth)}
          tone={pendingThisMonth > 0 ? "warning" : "default"}
        />
      </div>

      {/* Habitaciones activas */}
      <div style={{ display: "grid", gap: "var(--ui-sp-3)" }}>
        <h2 className="du-h3" style={{ margin: 0 }}>
          Habitaciones
        </h2>
        {active.length === 0 ? (
          <p className="du-muted">No hay habitaciones alquiladas ahora mismo.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "var(--ui-sp-4)",
            }}
          >
            {active.map((r) => (
              <RoomRentalCard
                key={r.id}
                rental={r}
                currentPeriod={currentPeriod}
                onTogglePayment={() => void togglePayment(r, currentPeriod)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Contratos finalizados */}
      {ended.length > 0 ? (
        <Card padded={false}>
          <div style={{ padding: "var(--ui-sp-3) var(--ui-sp-4)", borderBottom: "1px solid var(--ui-border)" }}>
            <strong>Contratos finalizados</strong>
          </div>
          {ended.map((r, i) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--ui-sp-3)",
                padding: "var(--ui-sp-3) var(--ui-sp-4)",
                borderTop: i > 0 ? "1px solid var(--ui-border)" : "none",
              }}
            >
              <div>
                <span style={{ fontWeight: 500 }}>{r.roomName ?? "Piso entero"}</span>
                <span className="du-muted" style={{ marginLeft: 8, fontSize: 13 }}>
                  {r.renterName}
                </span>
              </div>
              <ButtonLink href={`/alquileres/${r.id}`} variant="ghost" size="sm">
                Ver →
              </ButtonLink>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div
      style={{
        background: "var(--ui-surface)",
        border: "1px solid var(--ui-border)",
        borderRadius: "var(--ui-radius-lg)",
        padding: "var(--ui-sp-4)",
      }}
    >
      <div className="du-muted" style={{ fontSize: 13 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          marginTop: 2,
          color: tone === "warning" ? "var(--ui-warning)" : "var(--ui-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RoomRentalCard({
  rental,
  currentPeriod,
  onTogglePayment,
}: {
  rental: Rental;
  currentPeriod: string;
  onTogglePayment: () => void;
}) {
  const paid = paymentFor(rental, currentPeriod)?.status === "paid";
  return (
    <div
      style={{
        background: "var(--ui-surface)",
        border: "1px solid var(--ui-border)",
        borderRadius: "var(--ui-radius-lg)",
        padding: "var(--ui-sp-4)",
        display: "grid",
        gap: "var(--ui-sp-3)",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <DoorOpen size={14} className="du-muted" />
          {rental.roomName ?? "Piso entero"}
        </div>
        <div className="du-muted" style={{ fontSize: 13, marginTop: 2 }}>
          {rental.renterName}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 600 }}>{eur(rental.monthlyRent)}</span>
        <span className="du-muted" style={{ fontSize: 13 }}>
          /mes
        </span>
      </div>

      <button
        type="button"
        onClick={onTogglePayment}
        aria-label={`Marcar ${periodShort(currentPeriod)} como ${paid ? "pendiente" : "cobrado"}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--ui-sp-2)",
          padding: "var(--ui-sp-2) var(--ui-sp-3)",
          borderRadius: "var(--ui-radius)",
          border: `1px solid ${paid ? "transparent" : "var(--ui-border)"}`,
          background: paid ? "var(--ui-success-bg)" : "transparent",
          color: paid ? "var(--ui-success)" : "var(--ui-text)",
          cursor: "pointer",
          font: "inherit",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {paid ? <Check size={15} /> : <span style={{ opacity: 0.5 }}>○</span>}
          {periodShort(currentPeriod).charAt(0).toUpperCase() + periodShort(currentPeriod).slice(1)}{" "}
          {new Date().getFullYear()}
        </span>
        <span>{paid ? "Cobrado" : "Marcar cobrado"}</span>
      </button>

      <ButtonLink href={`/alquileres/${rental.id}`} variant="ghost" size="sm">
        Gestionar contrato →
      </ButtonLink>
    </div>
  );
}

export default function PropertyRentalsPage() {
  const params = useParams<{ propertyId: string }>();
  const { selected } = useWorkspace();
  const loading = useRequireModule("rentals");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <PropertyRentalsInner slug={selected.slug} propertyId={params.propertyId} />;
}
