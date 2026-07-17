"use client";

import Link from "next/link";
import { Card } from "@rep/ui";
import { useAuth } from "@/contexts/auth-context";
import { useWorkspace } from "@/contexts/workspace-context";
import { MODULE_SECTIONS } from "@/lib/modules";

export default function HomePage() {
  const { me } = useAuth();
  const { selected, activeModules, hasModule } = useWorkspace();
  const sections = MODULE_SECTIONS.filter((s) => hasModule(s.code));

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-6)" }}>
      <div>
        <h1 className="du-h1">Hola, {me?.user.name?.split(" ")[0]}</h1>
        {selected ? (
          <p className="du-muted" style={{ marginTop: 4 }}>
            {selected.name}
          </p>
        ) : null}
      </div>

      {activeModules === null ? (
        <p className="du-muted">Cargando…</p>
      ) : sections.length === 0 ? (
        <Card>
          <p className="du-muted">
            Estamos preparando tus herramientas. En breve las verás aquí.
          </p>
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "var(--ui-sp-4)",
          }}
        >
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.href} href={s.href} style={{ textDecoration: "none" }}>
                <Card className="dash-tile">
                  <Icon size={20} color="var(--ui-primary)" />
                  <div className="du-h3" style={{ marginTop: "var(--ui-sp-3)" }}>
                    {s.label}
                  </div>
                  <p className="du-muted" style={{ fontSize: 13, marginTop: 2 }}>
                    {s.description}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
