"use client";

import { Badge, Card } from "@rep/ui";
import { useAuth } from "@/contexts/auth-context";
import { useWorkspace } from "@/contexts/workspace-context";

export default function HomePage() {
  const { me } = useAuth();
  const { memberships, selected, activeModules } = useWorkspace();

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <h1 className="du-h1">Hola, {me?.user.name}</h1>

      {memberships.length === 0 ? (
        <Card>
          <p className="du-muted">Todavía no perteneces a ninguna inmobiliaria.</p>
        </Card>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="du-h2">{selected?.name}</span>
            {selected ? <Badge variant="muted">{selected.role}</Badge> : null}
          </div>

          <Card>
            <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-3)" }}>
              Módulos activos
            </h2>
            {activeModules === null ? (
              <p className="du-muted">Cargando…</p>
            ) : activeModules.length === 0 ? (
              <p className="du-muted">Sin módulos contratados. Contáctanos para activarlos.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {activeModules.map((code) => (
                  <Badge key={code} variant="success">
                    {code}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
