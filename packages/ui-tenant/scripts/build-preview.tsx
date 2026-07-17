import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrandConfig } from "@rep/db";
import {
  AboutColumns,
  BigNumber,
  brandConfigToCssVars,
  Footer,
  PhotoPair,
  PillButton,
  Steps,
  WordmarkBleed,
} from "../src/index.js";

// Genera un HTML self-contained que renderiza un micrositio con los componentes
// reales y el CSS real, para dos tenants con brand_config distinto → prueba visual
// del white-label (Capa 1 default Dwell vs Capa 2 override por brand_config).

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const tokensCss = readFileSync(here("../src/styles/tokens.css"), "utf8");
const dwellCss = readFileSync(here("../src/styles/dwell.css"), "utf8");

function Microsite() {
  return (
    <>
      <WordmarkBleed text="DWELL" />
      <div style={{ padding: "32px 0" }}>
        <AboutColumns
          columns={[
            {
              title: "The Challenge",
              body: "Una experiencia de listado premium y calma, plenamente funcional.",
            },
            {
              title: "Design Approach",
              body: "Imágenes grandes, tipografía sobredimensionada y paleta neutra.",
            },
          ]}
        />
      </div>
      <BigNumber number="01" quote="We list one home at a time. We verify it right.">
        <p style={{ color: "var(--tenant-muted)", maxWidth: 480 }}>
          Cada propiedad se visita en persona antes de publicarse.
        </p>
      </BigNumber>
      <PhotoPair
        photos={[{ caption: "Verified Listing." }, { caption: "Private Tour." }]}
      />
      <div style={{ display: "flex", gap: 16, margin: "32px 0" }}>
        <PillButton>Book a Viewing</PillButton>
        <PillButton variant="outline">View All Listings</PillButton>
      </div>
      <Steps
        steps={[
          { title: "Site Visit", body: "Visita en persona." },
          { title: "Document Check", body: "Verificación legal." },
          { title: "Photography", body: "Fotografía profesional." },
          { title: "Listing Review", body: "Revisión final." },
        ]}
      />
      <div style={{ marginTop: 48 }}>
        <Footer
          brandHeading="Premium Real Estate · Lisbon"
          tagline="We list one home at a time. Every property is verified in person."
          columns={[
            {
              heading: "Navigate",
              links: [
                { label: "Home", href: "#" },
                { label: "About", href: "#" },
                { label: "Listings", href: "#" },
              ],
            },
            {
              heading: "Listings",
              links: [
                { label: "Apartments", href: "#" },
                { label: "Houses", href: "#" },
              ],
            },
            {
              heading: "Contact",
              links: [
                { label: "hello@dwell.com", href: "#" },
                { label: "Instagram", href: "#" },
              ],
            },
          ]}
        />
      </div>
    </>
  );
}

function panel(title: string, subtitle: string, brand: BrandConfig) {
  const vars = brandConfigToCssVars(brand) as Record<string, string>;
  const style = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  const inner = renderToStaticMarkup(<Microsite />);
  return `<section class="panel">
    <header class="panel__head">
      <span class="panel__title">${title}</span>
      <span class="panel__sub">${subtitle}</span>
    </header>
    <div class="rt-root panel__site" style="${style}">${inner}</div>
  </section>`;
}

const lopez = panel(
  "Agencia López",
  "brand_config vacío → Capa 1 (defaults Dwell)",
  {},
);
const martinez = panel(
  "Inmobiliaria Martínez",
  "brand_config → Capa 2 (override en runtime)",
  { primaryColor: "#1e3a8a", textPrimary: "#0b1f3a", borderRadius: 8 },
);

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@rep/ui-tenant — preview white-label</title>
<style>
${tokensCss}
${dwellCss}
body{margin:0;background:#e9e7e3;font-family:var(--tenant-font-body);}
.head{padding:24px 32px;border-bottom:1px solid rgba(0,0,0,.1);}
.head h1{margin:0;font-size:16px;font-weight:600;}
.head p{margin:4px 0 0;font-size:13px;color:#555;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(0,0,0,.1);}
@media(max-width:1100px){.grid{grid-template-columns:1fr;}}
.panel{background:var(--tenant-bg,#fbfbfb);}
.panel__head{padding:16px 24px;border-bottom:1px solid rgba(0,0,0,.08);background:#fff;}
.panel__title{display:block;font-weight:600;font-size:14px;}
.panel__sub{display:block;font-size:12px;color:#666;margin-top:2px;}
.panel__site{padding:32px 24px;overflow:hidden;}
</style>
</head>
<body>
<div class="head">
  <h1>@rep/ui-tenant — sistema white-label (base Dwell)</h1>
  <p>Mismo micrositio, mismos componentes, un solo build. Solo cambia el brand_config del tenant. (Fuentes: fallback del sistema en esta preview; en producción van Archivo + Hanken self-hosted.)</p>
</div>
<div class="grid">
${lopez}
${martinez}
</div>
</body>
</html>`;

writeFileSync(here("../preview.html"), html);
console.log("✅ preview escrita en packages/ui-tenant/preview.html");
