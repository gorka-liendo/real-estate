"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, type BrandConfig } from "@rep/ui";
import { useWorkspace } from "@/contexts/workspace-context";
import { api } from "@/lib/api";

function LogoManager({ slug, name }: { slug: string; name: string }) {
  const { brandConfig: wsBrand, setBrandConfig } = useWorkspace();
  const [brand, setBrand] = useState<BrandConfig | null>(wsBrand);
  const [busy, setBusy] = useState(false);
  const [faviconBusy, setFaviconBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setBrand((await api.brand.get(slug)).brandConfig ?? {});
    } catch {
      setError("No se pudo cargar la marca.");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { brandConfig } = await api.brand.uploadLogo(slug, file);
      setBrand(brandConfig);
      setBrandConfig(brandConfig); // el sidebar muestra el logo al instante
    } catch {
      setError("No se pudo subir el logo (jpg/png/webp/svg, máx 2 MB).");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeLogo() {
    const { brandConfig } = await api.brand.removeLogo(slug);
    setBrand(brandConfig);
    setBrandConfig(brandConfig);
  }

  async function onFavicon(file: File | null) {
    if (!file) return;
    setFaviconBusy(true);
    setError(null);
    try {
      const { brandConfig } = await api.brand.uploadFavicon(slug, file);
      setBrand(brandConfig);
    } catch {
      setError("No se pudo subir el favicon (png, svg, webp o ico, máx 1 MB).");
    } finally {
      setFaviconBusy(false);
      if (faviconRef.current) faviconRef.current.value = "";
    }
  }

  async function removeFavicon() {
    const { brandConfig } = await api.brand.removeFavicon(slug);
    setBrand(brandConfig);
  }

  if (brand === null) return <p className="du-muted">Cargando…</p>;

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div>
        <h1 className="du-h1">Ajustes</h1>
        <p className="du-muted" style={{ marginTop: 4 }}>
          El logo y la marca de {name}.
        </p>
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      <Card>
        <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
          Logo
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-4)" }}>
          <div
            style={{
              width: 120,
              height: 72,
              borderRadius: "var(--ui-radius)",
              border: "1px solid var(--ui-border)",
              background: "var(--ui-hover)",
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt={name}
                style={{ maxWidth: "88%", maxHeight: "80%", objectFit: "contain" }}
              />
            ) : (
              <span className="du-muted" style={{ fontSize: 12 }}>
                Sin logo
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              <ImagePlus size={15} />
              {busy ? "Subiendo…" : brand.logoUrl ? "Cambiar logo" : "Subir logo"}
            </Button>
            {brand.logoUrl ? (
              <Button variant="ghost" size="sm" onClick={() => void removeLogo()}>
                <Trash2 size={15} />
                Quitar
              </Button>
            ) : null}
          </div>
        </div>
        <p className="du-muted" style={{ fontSize: 12, marginTop: "var(--ui-sp-3)" }}>
          Formatos jpg, png, webp o svg. Si lo quitas, se muestra el nombre de la inmobiliaria.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
      </Card>

      <Card>
        <h2 className="du-h3" style={{ marginBottom: "var(--ui-sp-4)" }}>
          Favicon
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ui-sp-4)" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "var(--ui-radius-sm)",
              border: "1px solid var(--ui-border)",
              background: "var(--ui-hover)",
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            {brand.faviconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.faviconUrl}
                alt="Favicon"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <span className="du-muted" style={{ fontSize: 11 }}>
                —
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
            <Button variant="outline" size="sm" onClick={() => faviconRef.current?.click()} disabled={faviconBusy}>
              <ImagePlus size={15} />
              {faviconBusy ? "Subiendo…" : brand.faviconUrl ? "Cambiar favicon" : "Subir favicon"}
            </Button>
            {brand.faviconUrl ? (
              <Button variant="ghost" size="sm" onClick={() => void removeFavicon()}>
                <Trash2 size={15} />
                Quitar
              </Button>
            ) : null}
          </div>
        </div>
        <p className="du-muted" style={{ fontSize: 12, marginTop: "var(--ui-sp-3)" }}>
          El icono de la pestaña del navegador en tu micrositio. Mejor una imagen
          cuadrada (png, svg, webp o ico). Si no pones ninguno, se usa el icono por defecto.
        </p>
        <input
          ref={faviconRef}
          type="file"
          accept="image/png,image/webp,image/svg+xml,image/x-icon,.ico"
          hidden
          onChange={(e) => void onFavicon(e.target.files?.[0] ?? null)}
        />
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--ui-sp-4)" }}>
          <h2 className="du-h3">Tu diseño</h2>
          <Badge variant="muted">gestionado por nosotros</Badge>
        </div>
        <div
          className="du-app"
          data-theme={brand.theme ?? "dwell"}
          style={{
            borderRadius: "var(--ui-radius)",
            border: "1px solid var(--ui-border)",
            padding: "var(--ui-sp-5)",
          }}
        >
          <div className="du-h2" style={{ marginBottom: "var(--ui-sp-2)" }}>
            {name}
          </div>
          <p className="du-muted" style={{ fontSize: 13, marginBottom: "var(--ui-sp-4)" }}>
            Así se ve tu marca en tu dashboard y tu micrositio.
          </p>
          <div style={{ display: "flex", gap: "var(--ui-sp-2)", flexWrap: "wrap" }}>
            <Button size="sm">Botón principal</Button>
            <Button variant="outline" size="sm">
              Secundario
            </Button>
            <Badge variant="success">activo</Badge>
          </div>
        </div>
        <p className="du-muted" style={{ fontSize: 12, marginTop: "var(--ui-sp-3)" }}>
          Diseñamos tu identidad a medida. ¿Quieres cambios de color o estilo? Escríbenos
          y los aplicamos por ti.
        </p>
      </Card>
    </div>
  );
}

export default function AjustesPage() {
  const { selected } = useWorkspace();
  if (!selected) return <p className="du-muted">Cargando…</p>;
  return <LogoManager slug={selected.slug} name={selected.name} />;
}
