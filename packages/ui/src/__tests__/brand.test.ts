import { describe, expect, it } from "vitest";
import type { BrandConfig } from "../brand.js";
import { brandConfigToUiVars } from "../brand.js";

describe("brandConfigToUiVars (white-label total del dashboard)", () => {
  it("config vacío → sin overrides (usa defaults del producto)", () => {
    expect(brandConfigToUiVars({})).toEqual({});
    expect(brandConfigToUiVars(null)).toEqual({});
  });

  it("primaryColor mapea y calcula texto legible por contraste", () => {
    const dark = brandConfigToUiVars({ primaryColor: "#1e3a8a" }) as Record<string, string>;
    expect(dark["--ui-primary"]).toBe("#1e3a8a");
    expect(dark["--ui-on-primary"]).toBe("#fbfbfb"); // sobre azul oscuro → texto claro
  });

  it("primary claro → texto oscuro (guardarraíl de contraste)", () => {
    const light = brandConfigToUiVars({ primaryColor: "#ffe066" }) as Record<string, string>;
    expect(light["--ui-on-primary"]).toBe("#0a0a0a"); // sobre amarillo → texto oscuro
  });

  it("borderRadius deriva la escala de radios", () => {
    const v = brandConfigToUiVars({ borderRadius: 8 }) as Record<string, string>;
    expect(v["--ui-radius"]).toBe("8px");
    expect(v["--ui-radius-lg"]).toBe("12px");
    expect(v["--ui-radius-sm"]).toBe("6px");
  });

  it("fondo oscuro deriva superficie/borde/tinta coherentes", () => {
    const v = brandConfigToUiVars({ background: "#0b0b0f" }) as Record<string, string>;
    expect(v["--ui-bg"]).toBe("#0b0b0f");
    expect(v["--ui-surface"]).toBeTruthy();
    expect(v["--ui-text"]).toBe("#f5f5f5"); // tinta clara auto para fondo oscuro
    expect(v["--ui-border"]).toContain("255");
  });

  it("textPrimary explícito gana sobre la derivación automática", () => {
    const v = brandConfigToUiVars({
      background: "#0b0b0f",
      textPrimary: "#c0ffee",
    }) as Record<string, string>;
    expect(v["--ui-text"]).toBe("#c0ffee");
  });

  it("fontDisplay se envuelve en comillas para CSS", () => {
    const v = brandConfigToUiVars({ fontDisplay: "Playfair Display" }) as Record<string, string>;
    expect(v["--ui-font-display"]).toBe('"Playfair Display", sans-serif');
  });
});
