"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

// Migas de pan consistentes para todos los apartados. Cada nivel es clicable
// (menos el último), así la navegación es predecible sin depender del botón
// "atrás" del navegador.
export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ label: "Inicio", href: "/" }, ...items];
  return (
    <nav
      aria-label="Ruta de navegación"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexWrap: "wrap",
        fontSize: 13,
        minWidth: 0,
      }}
    >
      {all.map((c, i) => {
        const last = i === all.length - 1;
        return (
          <span key={`${c.label}-${i}`} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {c.href && !last ? (
              <Link
                href={c.href}
                className="du-muted"
                style={{ textDecoration: "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
              >
                {c.label}
              </Link>
            ) : (
              <span style={{ color: last ? "var(--ui-text)" : "var(--ui-muted)", fontWeight: last ? 500 : 400 }}>
                {c.label}
              </span>
            )}
            {!last ? <ChevronRight size={13} style={{ color: "var(--ui-muted)", opacity: 0.6 }} /> : null}
          </span>
        );
      })}
    </nav>
  );
}
