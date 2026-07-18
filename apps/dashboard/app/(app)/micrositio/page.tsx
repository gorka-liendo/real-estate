"use client";

import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, ButtonLink, Card, Input, Label, Textarea } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, type SiteConfig, type SocialLink } from "@/lib/api";
import { TENANT_SITE_URL } from "@/lib/config";

function Editor({ slug, name }: { slug: string; name: string }) {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setConfig((await api.site.get(slug)).siteConfig ?? {});
    } catch {
      setError("No se pudo cargar la configuración.");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof SiteConfig>(key: K, value: SiteConfig[K]) {
    setConfig((c) => ({ ...(c ?? {}), [key]: value }));
    setSavedAt(null);
  }

  function setSocial(next: SocialLink[]) {
    set("social", next);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const clean: SiteConfig = {
        ...config,
        social: (config.social ?? []).filter((s) => s.label.trim() && s.url.trim()),
      };
      const res = await api.site.update(slug, clean);
      setConfig(res.siteConfig ?? {});
      setSavedAt(Date.now());
    } catch {
      setError("No se pudo guardar. Revisa los campos.");
    } finally {
      setSaving(false);
    }
  }

  const previewUrl = `${TENANT_SITE_URL}/?__tenant=${slug}`;

  if (config === null) return <p className="du-muted">Cargando…</p>;

  const social = config.social ?? [];

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 className="du-h1">Micrositio</h1>
          <p className="du-muted" style={{ marginTop: 4 }}>
            El contenido de la web pública de {name}. Se publica en unos segundos.
          </p>
        </div>
        <ButtonLink href={previewUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">
          <ExternalLink size={15} />
          Ver micrositio
        </ButtonLink>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      <Card>
        <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
          Portada
        </h2>
        <div style={{ display: "grid", gap: "var(--ui-sp-4)" }}>
          <div>
            <Label htmlFor="eyebrow">Antetítulo</Label>
            <Input
              id="eyebrow"
              placeholder="Inmobiliaria en Bilbao"
              value={config.heroEyebrow ?? ""}
              onChange={(e) => set("heroEyebrow", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="title">Titular</Label>
            <Input
              id="title"
              placeholder="Tu próximo hogar, verificado."
              value={config.heroTitle ?? ""}
              onChange={(e) => set("heroTitle", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="subtitle">Subtítulo</Label>
            <Textarea
              id="subtitle"
              placeholder="Una frase que explique qué os hace diferentes."
              value={config.heroSubtitle ?? ""}
              onChange={(e) => set("heroSubtitle", e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
          Sobre la inmobiliaria
        </h2>
        <Textarea
          placeholder="Cuenta quiénes sois en un par de frases."
          value={config.about ?? ""}
          onChange={(e) => set("about", e.target.value)}
        />
      </Card>

      <Card>
        <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
          Contacto
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--ui-sp-4)",
          }}
        >
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="hola@inmobiliaria.com"
              value={config.contactEmail ?? ""}
              onChange={(e) => set("contactEmail", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              placeholder="+34 900 000 000"
              value={config.contactPhone ?? ""}
              onChange={(e) => set("contactPhone", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="footer-address">Dirección (pie de página)</Label>
            <Input
              id="footer-address"
              placeholder="Gran Vía 12, 48001 Bilbao"
              value={config.footerAddress ?? ""}
              onChange={(e) => set("footerAddress", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="footer-schedule">Horario (pie de página)</Label>
            <Input
              id="footer-schedule"
              placeholder="L–V 9:30–19:00 · S 10:00–13:30"
              value={config.footerSchedule ?? ""}
              onChange={(e) => set("footerSchedule", e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: "var(--ui-sp-5)" }}>
          <Label>Redes y enlaces</Label>
          <div style={{ display: "grid", gap: "var(--ui-sp-3)", marginTop: "var(--ui-sp-2)" }}>
            {social.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
                <Input
                  placeholder="Instagram"
                  value={s.label}
                  onChange={(e) =>
                    setSocial(social.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  style={{ maxWidth: 180 }}
                />
                <Input
                  placeholder="https://instagram.com/…"
                  value={s.url}
                  onChange={(e) =>
                    setSocial(social.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSocial(social.filter((_, j) => j !== i))}
                  aria-label="Quitar enlace"
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSocial([...social, { label: "", url: "" }])}
              >
                <Plus size={15} />
                Añadir enlace
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-3)" }}>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
        {savedAt ? (
          <span className="du-muted" style={{ fontSize: 13 }}>
            Guardado ✓
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function MicrositioPage() {
  const { selected } = useWorkspace();
  const loading = useRequireModule("microsite");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <Editor slug={selected.slug} name={selected.name} />;
}
