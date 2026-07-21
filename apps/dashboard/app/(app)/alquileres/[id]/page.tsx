"use client";

import { ArrowLeft, Mail, Phone, Square, User } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card, Input, Label, Textarea } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import {
  api,
  ApiError,
  type RentalClientRef,
  type RentalDetail,
  type RentalPayment,
} from "@/lib/api";

// Gestión de un contrato de alquiler: inquilino y propietario vinculados a sus
// clientes del CRM, historial completo de cobros mes a mes, renta y notas.

const eur = (n: number) => `${new Intl.NumberFormat("es-ES").format(n)} €`;
const MONTH_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

// Meses "YYYY-MM" desde el inicio del contrato hasta hoy (o su fin), más reciente primero.
function contractMonths(startISO: string, endISO: string | null): string[] {
  const start = new Date(startISO);
  const endBound = endISO ? new Date(endISO) : new Date();
  const out: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(endBound.getFullYear(), endBound.getMonth(), 1);
  while (cur <= last) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out.reverse();
}

const monthLabel = (p: string) => `${MONTH_LONG[Number(p.slice(5)) - 1]} ${p.slice(0, 4)}`;
// Los cobros guardan el periodo como "YYYY-MM-DD" (día 1); lo normalizamos a "YYYY-MM".
const payKey = (period: string) => period.slice(0, 7);

function ClientLink({ client, role }: { client: RentalClientRef; role: string }) {
  return (
    <div>
      <Label>{role}</Label>
      <p style={{ margin: "4px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
        <User size={14} className="du-muted" />
        <Link href={`/clientes/${client.id}`} style={{ color: "inherit", textDecoration: "underline" }}>
          {client.name}
        </Link>
      </p>
      {client.email ? (
        <a
          className="du-muted"
          href={`mailto:${client.email}`}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginTop: 4 }}
        >
          <Mail size={13} />
          {client.email}
        </a>
      ) : null}
      {client.phone ? (
        <a
          className="du-muted"
          href={`tel:${client.phone}`}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginTop: 2 }}
        >
          <Phone size={13} />
          {client.phone}
        </a>
      ) : null}
    </div>
  );
}

function RentalDetailInner({ slug, rentalId }: { slug: string; rentalId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<RentalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rent, setRent] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api.rentals.get(slug, rentalId);
      setDetail(d);
      setRent(String(d.rental.monthlyRent));
      setNotes(d.rental.notes ?? "");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) router.replace("/alquileres");
      else setError("No se pudo cargar el contrato.");
    }
  }, [slug, rentalId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!detail) {
    return error ? <p className="du-alert">{error}</p> : <p className="du-muted">Cargando…</p>;
  }

  const { rental, property, tenant, owner } = detail;
  const isActive = rental.status === "active";

  // Cobros indexados por "YYYY-MM".
  const byPeriod = new Map<string, RentalPayment>();
  for (const p of detail.payments) byPeriod.set(payKey(p.period), p);
  const months = contractMonths(rental.startDate, rental.endDate);

  const thisYear = new Date().getFullYear();
  const collectedThisYear = detail.payments
    .filter((p) => p.status === "paid" && p.period.startsWith(String(thisYear)))
    .reduce((s, p) => s + p.amount, 0);
  const pendingCount = months.filter((m) => byPeriod.get(m)?.status !== "paid").length;

  async function togglePayment(period: string, current: RentalPayment | undefined) {
    setError(null);
    const next = current?.status === "paid" ? "pending" : "paid";
    try {
      await api.rentals.setPayment(slug, rentalId, period, next);
      await load();
    } catch {
      setError("No se pudo actualizar el cobro.");
    }
  }

  async function saveRent() {
    const n = Number(rent);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Renta inválida.");
      return;
    }
    setError(null);
    try {
      await api.rentals.update(slug, rentalId, { monthlyRent: Math.round(n) });
      await load();
    } catch {
      setError("No se pudo guardar la renta.");
    }
  }

  async function saveNotes() {
    setError(null);
    try {
      await api.rentals.update(slug, rentalId, { notes: notes.trim() });
      await load();
    } catch {
      setError("No se pudieron guardar las notas.");
    }
  }

  async function finalize() {
    if (!confirm("¿Finalizar este contrato? Se marcará con la fecha de hoy.")) return;
    setError(null);
    try {
      await api.rentals.update(slug, rentalId, { status: "ended" });
      await load();
    } catch {
      setError("No se pudo finalizar el contrato.");
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-3)" }}>
        <ButtonLink href="/alquileres" variant="ghost" size="sm">
          <ArrowLeft size={15} />
          Alquileres
        </ButtonLink>
        <h1 className="du-h1" style={{ margin: 0 }}>
          {property ? property.title : "Contrato"}
        </h1>
        {detail.room ? <Badge variant="muted">{detail.room.name}</Badge> : null}
        <Badge variant={isActive ? "success" : "default"}>
          {isActive ? "Activo" : "Finalizado"}
        </Badge>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      {/* Resumen */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "var(--ui-sp-4)",
        }}
      >
        <Card>
          <Label>Renta mensual</Label>
          <p className="du-h2" style={{ margin: "4px 0 0" }}>{eur(rental.monthlyRent)}</p>
        </Card>
        <Card>
          <Label>Cobrado {thisYear}</Label>
          <p className="du-h2" style={{ margin: "4px 0 0" }}>{eur(collectedThisYear)}</p>
        </Card>
        <Card>
          <Label>Meses pendientes</Label>
          <p className="du-h2" style={{ margin: "4px 0 0" }}>{pendingCount}</p>
        </Card>
        <Card>
          <Label>Vigencia</Label>
          <p style={{ margin: "4px 0 0", fontSize: 14 }}>
            Desde {fmtDate(rental.startDate)}
            {rental.endDate ? <><br />Hasta {fmtDate(rental.endDate)}</> : null}
          </p>
        </Card>
      </div>

      {/* Personas + gestión */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--ui-sp-5)",
          alignItems: "start",
        }}
      >
        <Card>
          <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
            Personas
          </h2>
          {tenant ? (
            <ClientLink client={tenant} role="Inquilino" />
          ) : (
            <div>
              <Label>Inquilino</Label>
              <p style={{ margin: "4px 0 0" }}>
                {rental.renterName}{" "}
                <span className="du-muted" style={{ fontSize: 13 }}>(sin ficha en el CRM)</span>
              </p>
            </div>
          )}
          <div style={{ height: "var(--ui-sp-4)" }} />
          {owner ? (
            <ClientLink client={owner} role="Propietario" />
          ) : (
            <div>
              <Label>Propietario</Label>
              <p className="du-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                Sin propietario asignado al inmueble. Asígnalo desde Propiedades.
              </p>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
            Contrato
          </h2>
          <Label htmlFor="r-rent">Renta mensual (€)</Label>
          <div style={{ display: "flex", gap: "var(--ui-sp-2)", marginBottom: "var(--ui-sp-4)" }}>
            <Input
              id="r-rent"
              type="number"
              min="1"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              disabled={!isActive}
            />
            <Button size="sm" onClick={() => void saveRent()} disabled={!isActive}>
              Guardar
            </Button>
          </div>
          <Label htmlFor="r-notes">Notas</Label>
          <Textarea
            id="r-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Condiciones, fianza, incidencias…"
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--ui-sp-3)" }}>
            <Button variant="ghost" size="sm" onClick={() => void saveNotes()}>
              Guardar notas
            </Button>
            {isActive ? (
              <Button variant="ghost" size="sm" onClick={() => void finalize()}>
                <Square size={14} />
                Finalizar
              </Button>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Historial de cobros */}
      <Card>
        <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
          Historial de cobros
        </h2>
        {months.length === 0 ? (
          <p className="du-muted">Sin meses que cobrar todavía.</p>
        ) : (
          <div style={{ display: "grid", gap: 0 }}>
            {months.map((m, i) => {
              const pay = byPeriod.get(m);
              const paid = pay?.status === "paid";
              return (
                <div
                  key={m}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--ui-sp-4)",
                    borderTop: i > 0 ? "1px solid var(--ui-border)" : "none",
                    padding: "var(--ui-sp-3) 0",
                  }}
                >
                  <div>
                    <span style={{ textTransform: "capitalize" }}>{monthLabel(m)}</span>
                    {paid && pay?.paidAt ? (
                      <span className="du-muted" style={{ fontSize: 12, marginLeft: 8 }}>
                        cobrado el {fmtDate(pay.paidAt)}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-3)" }}>
                    <span style={{ minWidth: 70, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {eur(pay?.amount ?? rental.monthlyRent)}
                    </span>
                    <Badge variant={paid ? "success" : "muted"}>
                      {paid ? "Cobrado" : "Pendiente"}
                    </Badge>
                    <Button
                      size="sm"
                      variant={paid ? "ghost" : "solid"}
                      onClick={() => void togglePayment(m, pay)}
                    >
                      {paid ? "Marcar pendiente" : "Marcar cobrado"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function RentalDetailPage() {
  const params = useParams<{ id: string }>();
  const { selected } = useWorkspace();
  const loading = useRequireModule("rentals");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <RentalDetailInner slug={selected.slug} rentalId={params.id} />;
}
