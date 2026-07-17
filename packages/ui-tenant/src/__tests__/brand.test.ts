import { describe, expect, it } from "vitest";
import type { BrandConfig } from "@rep/db";
import { brandConfigToCssVars, brandConfigToStyleString } from "../brand.js";

describe("brandConfigToCssVars (Capa 2 white-label)", () => {
  it("config vacío → sin variables (todo cae a defaults Dwell)", () => {
    expect(brandConfigToCssVars({})).toEqual({});
    expect(brandConfigToCssVars(null)).toEqual({});
    expect(brandConfigToCssVars(undefined)).toEqual({});
  });

  it("mapea cada campo a su variable CSS", () => {
    const brand: BrandConfig = {
      primaryColor: "#1e3a8a",
      textPrimary: "#111",
      fontDisplay: "Playfair Display",
      borderRadius: 8,
    };
    expect(brandConfigToCssVars(brand)).toEqual({
      "--tenant-primary": "#1e3a8a",
      "--tenant-text": "#111",
      "--tenant-font-display": "Playfair Display",
      "--tenant-radius": "8px",
    });
  });

  it("borderRadius 0 se emite como 0px (no se pierde por falsy)", () => {
    expect(brandConfigToCssVars({ borderRadius: 0 })).toEqual({ "--tenant-radius": "0px" });
  });

  it("campos no visuales (logoUrl, micrositeStyle) no generan variables", () => {
    const vars = brandConfigToCssVars({
      logoUrl: "https://x/logo.png",
      faviconUrl: "https://x/fav.ico",
      micrositeStyle: "bold",
    });
    expect(vars).toEqual({});
  });

  it("brandConfigToStyleString serializa a CSS para inyectar en <style>", () => {
    const css = brandConfigToStyleString({ primaryColor: "#000", borderRadius: 4 });
    expect(css).toContain(":root {");
    expect(css).toContain("--tenant-primary: #000;");
    expect(css).toContain("--tenant-radius: 4px;");
  });

  it("style string vacío cuando no hay overrides", () => {
    expect(brandConfigToStyleString({})).toBe("");
  });
});
