"use client";

import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, ButtonLink, Card, Input, Label, Select, Switch, Textarea } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import {
  api,
  ApiError,
  type SiteConfig,
  type SiteEditorApi,
  type SiteSection,
  type SocialLink,
} from "@/lib/api";
import { TENANT_SITE_URL } from "@/lib/config";
import {
  deriveEditorSections,
  effectiveNavLabel,
  newSection,
  SECTION_META_BY_TYPE,
  SECTION_TYPE_METAS,
  type ListField,
  type MediaField,
  type ScalarField,
  type SectionField,
} from "@/lib/microsite-sections";

// Lee un campo escalar de una sección (unión discriminada) de forma genérica
// para el editor data-driven. Cast localizado y controlado.
function fieldValue(section: SiteSection, key: string): string {
  const v = (section as unknown as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}
// Lee un campo LISTA (array de sub-ítems) de forma genérica.
function listValue(section: SiteSection, key: string): Record<string, string>[] {
  const v = (section as unknown as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as Record<string, string>[]) : [];
}

// Input escalar reutilizable: lo usan tanto los campos de nivel de sección como
// los sub-campos de cada ítem de una lista.
function ScalarInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: ScalarField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "select") {
    return (
      <Select
        id={id}
        value={value || field.options![0]!.value}
        onChange={(e) => onChange(e.target.value)}
      >
        {field.options!.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }
  if (field.type === "textarea") {
    return (
      <Textarea
        id={id}
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <Input
      id={id}
      placeholder={field.placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// Editor de una lista de sub-ítems repetibles (p.ej. las cifras de la sección
// Cifras). Cada ítem expone sus sub-campos escalares + un botón de quitar.
function SectionListField({
  section,
  field,
  onChange,
}: {
  section: SiteSection;
  field: ListField;
  onChange: (value: Record<string, string>[]) => void;
}) {
  const items = listValue(section, field.key);
  const atMax = field.max != null && items.length >= field.max;

  return (
    <div>
      <Label>{field.label}</Label>
      <div style={{ display: "grid", gap: "var(--ui-sp-3)", marginTop: "var(--ui-sp-2)" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: "var(--ui-sp-2)", alignItems: "flex-end" }}>
            {field.itemFields.map((sf) => (
              <div key={sf.key} style={{ flex: 1, minWidth: 0 }}>
                <Label htmlFor={`${section.id}-${field.key}-${i}-${sf.key}`}>{sf.label}</Label>
                <ScalarInput
                  id={`${section.id}-${field.key}-${i}-${sf.key}`}
                  field={sf}
                  value={item[sf.key] ?? ""}
                  onChange={(v) =>
                    onChange(items.map((it, j) => (j === i ? { ...it, [sf.key]: v } : it)))
                  }
                />
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label={`Quitar ${field.itemLabel}`}
            >
              <Trash2 size={15} />
            </Button>
          </div>
        ))}
        {!atMax ? (
          <div>
            <Button variant="outline" size="sm" onClick={() => onChange([...items, {}])}>
              <Plus size={15} />
              Añadir {field.itemLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Campo de media: sube imagen/vídeo a @rep/storage y guarda la URL. Muestra
// vista previa (miniatura / vídeo) + subir/quitar.
function MediaFieldInput({
  uploadMedia,
  section,
  field,
  onChange,
}: {
  uploadMedia: (file: File) => Promise<{ url: string; kind: "image" | "video" }>;
  section: SiteSection;
  field: MediaField;
  onChange: (value: string | undefined) => void;
}) {
  const url = fieldValue(section, field.key) || undefined;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const { url: uploaded } = await uploadMedia(file);
      onChange(uploaded);
    } catch (e) {
      setErr(
        e instanceof ApiError && e.message === "too_large"
          ? "El archivo es demasiado grande."
          : e instanceof ApiError && e.message === "invalid_type"
            ? "Formato no admitido."
            : "No se pudo subir el archivo.",
      );
    } finally {
      setBusy(false);
    }
  }

  const inputId = `${section.id}-${field.key}-file`;
  const accept = field.accept === "video" ? "video/*" : "image/*";

  return (
    <div>
      <Label htmlFor={inputId}>{field.label}</Label>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-3)", flexWrap: "wrap" }}>
        {url ? (
          field.accept === "video" ? (
            <video
              src={url}
              muted
              style={{ width: 120, height: 68, objectFit: "cover", borderRadius: "var(--ui-radius-sm)", border: "1px solid var(--ui-border)" }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              style={{ width: 120, height: 68, objectFit: "cover", borderRadius: "var(--ui-radius-sm)", border: "1px solid var(--ui-border)" }}
            />
          )
        ) : null}
        <div style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
          <input
            id={inputId}
            type="file"
            accept={accept}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = ""; // permite re-subir el mismo archivo
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => document.getElementById(inputId)?.click()}
          >
            {busy ? "Subiendo…" : url ? "Cambiar" : "Subir"}
          </Button>
          {url ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onChange(undefined)}>
              Quitar
            </Button>
          ) : null}
        </div>
      </div>
      {err ? <p className="du-alert" style={{ marginTop: "var(--ui-sp-2)" }}>{err}</p> : null}
      {field.hint ? (
        <p className="du-muted" style={{ fontSize: 12, marginTop: "var(--ui-sp-2)" }}>
          {field.hint}
        </p>
      ) : null}
    </div>
  );
}

function SectionFieldInput({
  uploadMedia,
  section,
  field,
  onChange,
}: {
  uploadMedia: (file: File) => Promise<{ url: string; kind: "image" | "video" }>;
  section: SiteSection;
  field: SectionField;
  onChange: (key: string, value: unknown) => void;
}) {
  if (field.type === "list") {
    return (
      <SectionListField
        section={section}
        field={field}
        onChange={(value) => onChange(field.key, value)}
      />
    );
  }
  if (field.type === "media") {
    return (
      <MediaFieldInput
        uploadMedia={uploadMedia}
        section={section}
        field={field}
        onChange={(value) => onChange(field.key, value)}
      />
    );
  }
  return (
    <div>
      <Label htmlFor={`${section.id}-${field.key}`}>{field.label}</Label>
      <ScalarInput
        id={`${section.id}-${field.key}`}
        field={field}
        value={fieldValue(section, field.key)}
        onChange={(value) => onChange(field.key, value)}
      />
    </div>
  );
}

function SectionCard({
  uploadMedia,
  section,
  index,
  total,
  onPatch,
  onToggle,
  onMove,
  onRemove,
}: {
  uploadMedia: (file: File) => Promise<{ url: string; kind: "image" | "video" }>;
  section: SiteSection;
  index: number;
  total: number;
  onPatch: (id: string, key: string, value: unknown) => void;
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  const meta = SECTION_META_BY_TYPE[section.type];
  const navShown = effectiveNavLabel(section, meta) !== "";
  const navLabelValue = section.navLabel ?? meta.defaultNavLabel ?? "";

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

          {meta.navigable ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--ui-sp-3)",
                flexWrap: "wrap",
                marginTop: "var(--ui-sp-3)",
                paddingTop: "var(--ui-sp-3)",
                borderTop: "1px solid var(--ui-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-2)" }}>
                <Switch
                  checked={navShown}
                  onChange={(on) =>
                    onPatch(
                      section.id,
                      "navLabel",
                      on ? navLabelValue || meta.defaultNavLabel || meta.label : "",
                    )
                  }
                  label="Mostrar en el menú de navegación"
                />
                <span className="du-muted" style={{ fontSize: 13 }}>
                  Mostrar en el menú
                </span>
              </div>
              {navShown ? (
                <Input
                  value={navLabelValue}
                  onChange={(e) => onPatch(section.id, "navLabel", e.target.value)}
                  placeholder={meta.defaultNavLabel || meta.label}
                  aria-label="Etiqueta en el menú"
                  style={{ maxWidth: 220 }}
                />
              ) : null}
            </div>
          ) : null}

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
                uploadMedia={uploadMedia}
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

function Editor({
  slug,
  name,
  source,
  hasModule,
  backHref,
}: {
  slug: string;
  name: string;
  source: SiteEditorApi;
  hasModule: (code: string) => boolean;
  backHref?: string;
}) {
  const uploadMedia = (file: File) => source.uploadMedia(slug, file);
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false); // hay cambios sin guardar
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = (await source.get(slug)).siteConfig ?? {};
      // Materializa la lista de secciones (persistidas o derivadas) para que
      // el editor siempre trabaje con un array concreto y el primer guardado
      // la persista.
      setConfig({ ...loaded, sections: deriveEditorSections(loaded, hasModule) });
      setDirty(false);
    } catch {
      setError("No se pudo cargar la configuración.");
    }
  }, [slug, source, hasModule]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof SiteConfig>(key: K, value: SiteConfig[K]) {
    setConfig((c) => ({ ...(c ?? {}), [key]: value }));
    setDirty(true);
  }

  const sections = config?.sections ?? [];

  function setSections(next: SiteSection[]) {
    set("sections", next);
  }
  function patchSection(id: string, key: string, value: unknown) {
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
      const res = await source.update(slug, clean);
      const saved = res.siteConfig ?? {};
      setConfig({ ...saved, sections: deriveEditorSections(saved, hasModule) });
      setDirty(false);
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
      {/* Barra de acción sticky: guardar siempre a la vista */}
      <div className="mst-bar">
        <div style={{ minWidth: 0 }}>
          {backHref ? (
            <Link
              href={backHref}
              className="du-muted"
              style={{
                fontSize: 13,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <ArrowLeft size={14} /> Volver a Administración
            </Link>
          ) : null}
          <h1 className="du-h1" style={{ fontSize: 20, marginTop: backHref ? 4 : 0 }}>
            Micrositio {backHref ? `· ${name}` : ""}
          </h1>
          <p className="du-muted" style={{ fontSize: 13, marginTop: 2 }}>
            La web pública de {name}. Se publica en unos segundos.
          </p>
        </div>
        <div className="mst-bar__actions">
          <span
            className="du-muted"
            style={{ fontSize: 13, color: dirty ? "var(--ui-warning)" : undefined }}
          >
            {saving ? "Guardando…" : dirty ? "Cambios sin guardar" : "Todo guardado ✓"}
          </span>
          <ButtonLink href={previewUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">
            <ExternalLink size={15} />
            Ver
          </ButtonLink>
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      {/* 1 · Cabecera */}
      <Card>
        <h2 className="mst-group__title">Cabecera</h2>
        <p className="mst-group__desc">El header de tu web: estilo, marca y tamaño del logo.</p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "var(--ui-sp-4)",
          }}
        >
          <div>
            <Label htmlFor="header-style">Estilo de la cabecera</Label>
            <Select
              id="header-style"
              value={config.headerStyle ?? "floating"}
              onChange={(e) => set("headerStyle", e.target.value as "floating" | "solid")}
            >
              <option value="floating">Flotante — pastilla sobre la portada</option>
              <option value="solid">Barra sólida — clásica, a ancho completo</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="header-brand">Qué mostrar como marca</Label>
            <Select
              id="header-brand"
              value={config.headerBrand ?? "logo"}
              onChange={(e) => set("headerBrand", e.target.value as "logo" | "text")}
            >
              <option value="logo">Logo (si no hay, el nombre)</option>
              <option value="text">Nombre de la inmobiliaria</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="logo-scale">Tamaño del logo</Label>
            <Select
              id="logo-scale"
              value={String(config.logoScale ?? 1)}
              onChange={(e) => set("logoScale", Number(e.target.value))}
            >
              {[1, 1.25, 1.5, 1.75, 2, 2.25, 2.5].map((s) => (
                <option key={s} value={String(s)}>
                  {s === 1 ? "Normal (×1)" : `×${s}`}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="du-muted" style={{ fontSize: 12, marginTop: "var(--ui-sp-3)" }}>
          El logo se sube en Ajustes. Si eliges «Logo» y aún no lo has subido, se
          muestra el nombre.
        </p>
      </Card>

      {/* 2 · Secciones del cuerpo */}
      <div>
        <h2 className="mst-group__title">Secciones de la web</h2>
        <p className="mst-group__desc">
          Ordena, muestra u oculta las secciones del cuerpo y edita su contenido.
        </p>
        <div style={{ display: "grid", gap: "var(--ui-sp-3)" }}>
          {sections.map((section, i) => (
            <SectionCard
              key={section.id}
              uploadMedia={uploadMedia}
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
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--ui-sp-2)",
              marginTop: "var(--ui-sp-3)",
            }}
          >
            {addableTypes.map((m) => (
              <Button key={m.type} variant="outline" size="sm" onClick={() => addSection(m.type)}>
                <Plus size={15} />
                {m.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {/* 3 · Pie de página y contacto */}
      <Card>
        <h2 className="mst-group__title">Pie de página y contacto</h2>
        <p className="mst-group__desc">
          Lo que aparece en el pie de la web: descripción, datos de contacto y redes.
        </p>
        <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
          <div>
            <Label htmlFor="about">Descripción de la inmobiliaria</Label>
            <Textarea
              id="about"
              placeholder="Cuenta quiénes sois en un par de frases."
              value={config.about ?? ""}
              onChange={(e) => set("about", e.target.value)}
            />
          </div>

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
              <Label htmlFor="footer-address">Dirección</Label>
              <Input
                id="footer-address"
                placeholder="Gran Vía 12, 48001 Bilbao"
                value={config.footerAddress ?? ""}
                onChange={(e) => set("footerAddress", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="footer-schedule">Horario</Label>
              <Input
                id="footer-schedule"
                placeholder="L–V 9:30–19:00 · S 10:00–13:30"
                value={config.footerSchedule ?? ""}
                onChange={(e) => set("footerSchedule", e.target.value)}
              />
            </div>
          </div>

          <div>
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
        </div>
      </Card>
    </div>
  );
}

export default function MicrositioPage() {
  const { selected, hasModule } = useWorkspace();
  const loading = useRequireModule("microsite");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  // El owner edita SU tenant vía /tenant/site.
  return (
    <Editor slug={selected.slug} name={selected.name} source={api.site} hasModule={hasModule} />
  );
}

// El componente Editor se exporta para la variante de superadmin
// (app/(app)/admin/tenants/[slug]/micrositio) que lo reusa con api.adminSite.
export { Editor };
