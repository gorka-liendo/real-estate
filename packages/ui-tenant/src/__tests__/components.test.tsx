import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AboutColumns,
  BigNumber,
  Footer,
  LeadForm,
  MobileMenu,
  PhotoPair,
  PillButton,
  Steps,
  WordmarkBleed,
} from "../index.js";

// Render SSR de los 8 componentes signature: markup correcto + clases de token.

describe("componentes signature (Capa 1 Dwell)", () => {
  it("WordmarkBleed", () => {
    const html = renderToStaticMarkup(<WordmarkBleed text="DWELL" />);
    expect(html).toContain("rt-wordmark");
    expect(html).toContain("DWELL");
  });

  it("AboutColumns renderiza las dos columnas", () => {
    const html = renderToStaticMarkup(
      <AboutColumns
        columns={[
          { title: "The Challenge", body: "a" },
          { title: "Design Approach", body: "b" },
        ]}
      />,
    );
    expect(html).toContain("The Challenge");
    expect(html).toContain("Design Approach");
    expect((html.match(/rt-about__col/g) ?? []).length).toBe(2);
  });

  it("BigNumber", () => {
    const html = renderToStaticMarkup(<BigNumber number="01" quote="uno" />);
    expect(html).toContain("rt-bignumber__n");
    expect(html).toContain("01");
    expect(html).toContain("uno");
  });

  it("PhotoPair sin src usa placeholder accesible", () => {
    const html = renderToStaticMarkup(
      <PhotoPair
        photos={[
          { caption: "Verified Listing.", alt: "sala" },
          { caption: "Private Tour." },
        ]}
      />,
    );
    expect(html).toContain("Verified Listing.");
    expect(html).toContain('role="img"');
  });

  it("PillButton solid y outline", () => {
    expect(renderToStaticMarkup(<PillButton>Book</PillButton>)).toContain("rt-btn");
    expect(
      renderToStaticMarkup(<PillButton variant="outline">All</PillButton>),
    ).toContain("rt-btn--outline");
  });

  it("Steps numera con dos dígitos", () => {
    const html = renderToStaticMarkup(
      <Steps steps={[{ title: "Site Visit", body: "x" }, { title: "Photo", body: "y" }]} />,
    );
    expect(html).toContain("01");
    expect(html).toContain("02");
    expect(html).toContain("Site Visit");
  });

  it("MobileMenu lista los ítems", () => {
    const html = renderToStaticMarkup(
      <MobileMenu items={[{ label: "Home", href: "/" }, { label: "About", href: "/a" }]} />,
    );
    expect(html).toContain("rt-mobilemenu");
    expect(html).toContain("Home");
  });

  it("LeadForm renderiza los campos y el honeypot", () => {
    const html = renderToStaticMarkup(<LeadForm onSubmit={async () => {}} />);
    expect(html).toContain("rt-form");
    expect(html).toContain('id="lead-name"');
    expect(html).toContain('id="lead-email"');
    expect(html).toContain('rt-form__hp'); // honeypot presente
    expect(html).toContain('aria-hidden="true"');
  });

  it("Footer con columnas", () => {
    const html = renderToStaticMarkup(
      <Footer
        brandHeading="Premium Real Estate"
        tagline="We list one home at a time."
        columns={[{ heading: "Navigate", links: [{ label: "Home", href: "/" }] }]}
      />,
    );
    expect(html).toContain("Premium Real Estate");
    expect(html).toContain("Navigate");
  });
});
