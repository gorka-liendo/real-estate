"use client";

import { useEffect, useState } from "react";
import { Badge, Card } from "@rep/ui";
import { RequireAuth } from "@/components/require-auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";

function Home() {
  const { me } = useAuth();
  const memberships = me?.memberships ?? [];
  const [selected, setSelected] = useState<string | null>(memberships[0]?.slug ?? null);
  const [modules, setModules] = useState<string[] | null>(null);

  useEffect(() => {
    if (!selected) return;
    setModules(null);
    void api.tenantModules(selected).then((r) => setModules(r.modules));
  }, [selected]);

  const current = memberships.find((m) => m.slug === selected);

  return (
    <DashboardShell
      title={`Hola, ${me?.user.name ?? ""}`}
      memberships={memberships}
      selectedSlug={selected}
      onSelectTenant={setSelected}
    >
      {memberships.length === 0 ? (
        <Card>
          <p className="du-muted">Todavía no perteneces a ninguna inmobiliaria.</p>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="du-h2">{current?.name}</span>
            {current ? <Badge variant="muted">{current.role}</Badge> : null}
          </div>

          <Card>
            <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-3)" }}>
              Módulos activos
            </h2>
            {modules === null ? (
              <p className="du-muted">Cargando…</p>
            ) : modules.length === 0 ? (
              <p className="du-muted">Sin módulos contratados. Contáctanos para activarlos.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {modules.map((code) => (
                  <Badge key={code} variant="success">
                    {code}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}

export default function DashboardHome() {
  return (
    <RequireAuth>
      <Home />
    </RequireAuth>
  );
}
