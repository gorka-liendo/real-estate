"use client";

import { ChevronDown, ChevronUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, ButtonLink, Card, Input, Label, Select, Switch, Textarea } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, type SiteConfig, type SiteSection, type SocialLink } from "@/lib/api";
import { TENANT_SITE_URL } from "@/lib/config";
import {
  deriveEditorSections,
  newSection,
  SECTION_META_BY_TYPE,
  SECTION_TYPE_METAS,
  type SectionField,
} from "@/lib/microsite-sections";

// Lee un campo de una sección (unión discriminada) de forma genérica para el
// editor data-driven. Cast localizado y controlado.
function fieldValue(section: SiteSection, key: string): string {
  const v = (section as unknown as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function SectionFieldInput({
  section,
  field,
  onChange,
}: {
  section: SiteSection;
  field: SectionField;
  onChange: (key: string, value: string) => void;
}) {
  const id = `${section.id}-${field.key}`;
  const raw = fieldValue(section, field.key);

  return (
    <div>
      <Label htmlFor={id}>{field.label}</Label>
      {field.type === "select" ? (
        <Select
          id={id}
          value={raw || field.options![0]!.value}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          {field.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : field.type === "textarea" ? (
        <Textarea
          id={id}
          placeholder={field.placeholder}
          value={raw}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      ) : (
        <Input
          id={id}
          placeholder={field.placeholder}
          value={raw}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      )}
    </div>
  );
}

function SectionCard({
  section,
  index,
  total,
  onPatch,
  onToggle,
  onMove,
  onRemove,
}: {
  section: SiteSection;
  index: number;
  total: number;
  onPatch: (id: string, key: string, value: string) => void;
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  const meta = SECTION_META_BY_TYPE[section.type];

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--ui-sp-3)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMove(section.id, -1)}
            disabled={index === 0}
            aria-label="Subir sección"
          >
            <ChevronUp size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMove(section.id, 1)}
            disabled={index === total - 1}
            aria-label="Bajar sección"
          >
            <ChevronDown size={16} />
          </Button>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h3 className="du-h3">{meta.label}</h3>
              <p className="du-muted" style={{ fontSize: 13, marginTop: 2 }}>
                {meta.description}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-2)" }}>
              <Switch
                checked={section.enabled}
                onChange={() => onToggle(section.id)}
                label={`${section.enabled ? "Ocultar" : "Mostrar"} ${meta.label}`}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(section.id)}
                aria-label={`Quitar ${meta.label}`}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: "var(--ui-sp-4)",
              marginTop: "var(--ui-sp-4)",
              opacity: section.enabled ? 1 : 0.55,
            }}
          >
            {meta.fields.map((field) => (
              <SectionFieldInput
                key={field.key}
                section={section}
                field={field}
                onChange={(key, value) => onPatch(section.id, key, value)}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Editor({ slug, name }: { slug: string; name: string }) {
  const { hasModule } = useWorkspace();
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = (await api.site.get(slug)).siteConfig ?? {};
      // Materializa la lista de secciones (persistidas o derivadas) para que
      // el editor siempre trabaje con un array concreto y el primer guardado
      // la persista.
      setConfig({ ...loaded, sections: deriveEditorSections(loaded, hasModule) });
    } catch {
      setError("No se pudo cargar la configuración.");
    }
  }, [slug, hasModule]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof SiteConfig>(key: K, value: SiteConfig[K]) {
    setConfig((c) => ({ ...(c ?? {}), [key]: value }));
    setSavedAt(null);
  }

  const sections = config?.sections ?? [];

  function setSections(next: SiteSection[]) {
    set("sections", next);
  }
  function patchSection(id: string, key: string, value: string) {
    setSections(sections.map((s) => (s.id === id ? ({ ...s, [key]: value } as SiteSection) : s)));
  }
  function toggleSection(id: string) {
    setSections(sections.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }
  function moveSection(id: string, dir: -1 | 1) {
    const i = sections.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSections(next);
  }
  function removeSection(id: string) {
    setSections(sections.filter((s) => s.id !== id));
  }
  function addSection(type: SiteSection["type"]) {
    setSections([...sections, newSection(type)]);
  }

  // Tipos que se pueden AÑADIR: no presentes ya + con su módulo (si lo exigen).
  const presentTypes = new Set(sections.map((s) => s.type));
  const addableTypes = SECTION_TYPE_METAS.filter(
    (m) => !presentTypes.has(m.type) && (!m.moduleGate || hasModule(m.moduleGate)),
  );

  async function save() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      // `sections` es la fuente de verdad del hero → se dejan de escribir los
      // campos planos legacy (template/hero*). El resto (footer/contacto) sigue.
      const { template, heroEyebrow, heroTitle, heroSubtitle, ...rest } = config;
      void template;
      void heroEyebrow;
      void heroTitle;
      void heroSubtitle;
      const clean: SiteConfig = {
        ...rest,
        social: (config.social ?? []).filter((s) => s.label.trim() && s.url.trim()),
        sections,
      };
      const res = await api.site.update(slug, clean);
      const saved = res.siteConfig ?? {};
      setConfig({ ...saved, sections: deriveEditorSections(saved, hasModule) });
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

      <div>
        <h2 className="du-h2" style={{ marginBottom: 4 }}>
          Secciones de la web
        </h2>
        <p className="du-muted" style={{ fontSize: 13, marginBottom: "var(--ui-sp-4)" }}>
          Ordena, muestra u oculta las secciones de tu web y edita su contenido.
        </p>

        <div style={{ display: "grid", gap: "var(--ui-sp-3)" }}>
          {sections.map((section, i) => (
            <SectionCard
              key={section.id}
              section={section}
              index={i}
              total={sections.length}
              onPatch={patchSection}
              onToggle={toggleSection}
              onMove={moveSection}
              onRemove={removeSection}
            />
          ))}
        </div>

        {addableTypes.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ui-sp-2)", marginTop: "var(--ui-sp-3)" }}>
            {addableTypes.map((m) => (
              <Button key={m.type} variant="outline" size="sm" onClick={() => addSection(m.type)}>
                <Plus size={15} />
                {m.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

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
          Contacto y pie de página
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
                    set(
                      "social",
                      social.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    )
                  }
                  style={{ maxWidth: 180 }}
                />
                <Input
                  placeholder="https://instagram.com/…"
                  value={s.url}
                  onChange={(e) =>
                    set(
                      "social",
                      social.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => set("social", social.filter((_, j) => j !== i))}
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
                onClick={() => set("social", [...social, { label: "", url: "" } as SocialLink])}
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
