"use client";

import { Check, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, ApiError, type Visit, type VisitStatus } from "@/lib/api";

const STATUS_LABEL: Record<VisitStatus, string> = {
  requested: "Pendiente",
  confirmed: "Confirmada",
  done: "Hecha",
  cancelled: "Cancelada",
};
const STATUS_VARIANT: Record<VisitStatus, "muted" | "success" | "default"> = {
  requested: "muted",
  confirmed: "success",
  done: "default",
  cancelled: "default",
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function AgendaInner({ slug }: { slug: string }) {
  const { hasModule } = useWorkspace();
  const [items, setItems] = useState<Visit[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api.visits.list(slug)).visits);
      // Títulos de inmuebles para contexto (solo si tiene el módulo Propiedades).
      if (hasModule("properties")) {
        const { properties } = await api.properties.list(slug);
        setTitles(Object.fromEntries(properties.map((p) => [p.id, p.title])));
      }
    } catch {
      setError("No se pudo cargar la agenda.");
    }
  }, [slug, hasModule]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(v: Visit, status: VisitStatus) {
    setError(null);
    try {
      const { visit } = await api.visits.update(slug, v.id, { status });
      setItems((prev) => (prev ?? []).map((x) => (x.id === v.id ? visit : x)));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          `No se puede confirmar la visita de ${v.name}: choca con otra visita confirmada en esa franja.`,
        );
      } else {
        setError("No se pudo actualizar la visita.");
      }
    }
  }

  async function remove(id: string) {
    await api.visits.remove(slug, id);
    setItems((prev) => (prev ?? []).filter((x) => x.id !== id));
  }

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <h1 className="du-h1">Agenda</h1>

      {error ? <p className="du-alert">{error}</p> : null}

      <Card padded={false}>
        {items === null ? (
          <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
            Cargando…
          </p>
        ) : items.length === 0 ? (
          <p className="du-muted" style={{ padding: "var(--ui-sp-5)" }}>
            Sin visitas todavía. Cuando alguien pida visita desde tu micrositio, aparecerá aquí.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="du-table">
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Inmueble</th>
                  <th>Visitante</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                      {fmtWhen(v.scheduledAt)}
                    </td>
                    <td>{titles[v.propertyId] ?? "—"}</td>
                    <td>
                      {v.name}
                      <div className="du-muted" style={{ fontSize: 12 }}>
                        {v.email || v.phone || ""}
                      </div>
                    </td>
                    <td>
                      <Badge variant={STATUS_VARIANT[v.status]}>{STATUS_LABEL[v.status]}</Badge>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {v.status === "requested" ? (
                        <>
                          <Button size="sm" onClick={() => void setStatus(v, "confirmed")}>
                            <Check size={14} />
                            Confirmar
                          </Button>{" "}
                          <Button variant="ghost" size="sm" onClick={() => void setStatus(v, "cancelled")}>
                            <X size={14} />
                          </Button>
                        </>
                      ) : v.status === "confirmed" ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => void setStatus(v, "done")}>
                            <Check size={14} />
                            Hecha
                          </Button>{" "}
                          <Button variant="ghost" size="sm" onClick={() => void setStatus(v, "cancelled")}>
                            <X size={14} />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void remove(v.id)}
                          aria-label={`Eliminar visita de ${v.name}`}
                        >
                          <Trash2 size={15} />
                        </Button>
                      )}
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

export default function AgendaPage() {
  const { selected } = useWorkspace();
  const loading = useRequireModule("visits");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <AgendaInner slug={selected.slug} />;
}
