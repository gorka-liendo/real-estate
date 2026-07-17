"use client";

import type { ReactNode } from "react";
import { Card } from "@rep/ui";
import { useRequireModule } from "@/contexts/workspace-context";

// Envuelve una sección de módulo: la protege (si el tenant no lo tiene, vuelve a
// Inicio) y da el encabezado común. `children` = contenido real; si no, placeholder.
export function ModulePage({
  code,
  title,
  description,
  children,
}: {
  code: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  const loading = useRequireModule(code);
  if (loading) return <p className="du-muted">Cargando…</p>;

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <h1 className="du-h1">{title}</h1>
      {children ?? (
        <Card>
          <p className="du-muted">{description ?? "Próximamente."}</p>
        </Card>
      )}
    </div>
  );
}
