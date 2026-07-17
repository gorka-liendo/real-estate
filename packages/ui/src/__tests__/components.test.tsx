import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge, Button, Card, Input, cn } from "../index.js";

describe("cn", () => {
  it("ignora falsy y une con espacios", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("primitivos del design system", () => {
  it("Button aplica variante y tamaño", () => {
    const html = renderToStaticMarkup(
      <Button variant="outline" size="sm">
        Guardar
      </Button>,
    );
    expect(html).toContain("du-btn");
    expect(html).toContain("du-btn--outline");
    expect(html).toContain("du-btn--sm");
    expect(html).toContain("Guardar");
  });

  it("Badge success", () => {
    const html = renderToStaticMarkup(<Badge variant="success">microsite</Badge>);
    expect(html).toContain("du-badge--success");
  });

  it("Input y Card usan sus clases de token", () => {
    expect(renderToStaticMarkup(<Input placeholder="x" />)).toContain("du-input");
    expect(renderToStaticMarkup(<Card>hola</Card>)).toContain("du-card");
  });
});
