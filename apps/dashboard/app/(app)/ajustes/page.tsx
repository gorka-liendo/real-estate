"use client";

import { Card } from "@rep/ui";
import { useWorkspace } from "@/contexts/workspace-context";

// Ajustes de la inmobiliaria: marca, dominio y datos. (Edición: próximamente;
// hoy muestra el branding actual que ya tiñe el dashboard y el micrositio.)
function Swatch({ label, color }: { label: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: "1px solid var(--ui-border)",
          background: color ?? "transparent",
        }}
      />
      <span style={{ fontSize: 13 }}>
        {label}: <span className="du-muted">{color ?? "por defecto"}</span>
      </span>
    </div>
  );
}

export default function AjustesPage() {
  const { selected, brandConfig } = useWorkspace();

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div>
        <h1 className="du-h1">Ajustes</h1>
        <p className="du-muted" style={{ marginTop: 4 }}>
          La marca de {selected?.name} y la configuración de su web.
        </p>
      </div>

      <Card>
        <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
          Marca
        </h2>
        <div style={{ display: "grid", gap: "var(--ui-sp-3)" }}>
          <Swatch label="Color principal" color={brandConfig?.primaryColor} />
          <Swatch label="Color de acento" color={brandConfig?.accentColor} />
          <Swatch label="Fondo" color={brandConfig?.background} />
          <div style={{ fontSize: 13 }}>
            Tipografía:{" "}
            <span className="du-muted">
              {brandConfig?.fontDisplay ?? "por defecto"}
            </span>
          </div>
        </div>
        <p className="du-muted" style={{ fontSize: 12, marginTop: "var(--ui-sp-4)" }}>
          La edición de marca y dominio llegará aquí. Estos valores ya tiñen tu
          dashboard y tu micrositio.
        </p>
      </Card>
    </div>
  );
}
