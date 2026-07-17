"use client";

import { ButtonLink, Card } from "@rep/ui";
import { ModulePage } from "@/components/module-page";
import { useWorkspace } from "@/contexts/workspace-context";
import { TENANT_SITE_URL } from "@/lib/config";

export default function MicrositioPage() {
  const { selected } = useWorkspace();
  const previewUrl = selected
    ? `${TENANT_SITE_URL}/?__tenant=${selected.slug}`
    : TENANT_SITE_URL;

  return (
    <ModulePage code="microsite" title="Micrositio">
      <Card>
        <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-2)" }}>
          Tu web pública
        </h2>
        <p className="du-muted" style={{ marginBottom: "var(--ui-sp-4)" }}>
          La web pública de {selected?.name}. Su marca y dominio se configuran en
          Ajustes. Aquí gestionarás su contenido.
        </p>
        <ButtonLink href={previewUrl} target="_blank" rel="noreferrer" variant="outline">
          Ver micrositio
        </ButtonLink>
      </Card>
    </ModulePage>
  );
}
