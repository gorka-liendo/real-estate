"use client";

import { ButtonLink, Card } from "@rep/ui";
import { TENANT_SITE_URL } from "@/lib/config";
import { useWorkspace } from "@/contexts/workspace-context";

// Placeholder del módulo Micrositio (solo visible si el tenant lo tiene activo).
export default function MicrositePage() {
  const { selected } = useWorkspace();
  const previewUrl = selected
    ? `${TENANT_SITE_URL}/?__tenant=${selected.slug}`
    : TENANT_SITE_URL;

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <h1 className="du-h1">Micrositio</h1>
      <Card>
        <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-2)" }}>
          Web pública de {selected?.name}
        </h2>
        <p className="du-muted" style={{ marginBottom: "var(--ui-sp-4)" }}>
          Aquí se configurará el branding, el dominio y el contenido del micrositio.
          De momento puedes previsualizarlo con los datos actuales.
        </p>
        <ButtonLink href={previewUrl} target="_blank" rel="noreferrer" variant="outline">
          Ver micrositio
        </ButtonLink>
      </Card>
    </div>
  );
}
