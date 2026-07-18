"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MobileMenu, type MenuItem } from "./mobile-menu.js";

// Hamburguesa + overlay del topbar en móvil. El topbar oculta su nav inline en
// ≤640px y muestra este botón (ver .rt-burger en base.css). El overlay reutiliza
// MobileMenu (signature #7) y se cierra al navegar o con Escape.
//
// El overlay se PORTALEA al .rt-root más cercano: no puede vivir dentro del
// topbar (su backdrop-filter lo convierte en containing block de los
// position:fixed y el overlay quedaría preso en su franja), pero tampoco en
// document.body (fuera de .rt-root perdería las fuentes y los tokens del tema).
export function MobileNav({ items, label = "Menú" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  useEffect(() => {
    setPortalTarget(btnRef.current?.closest(".rt-root") ?? document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="rt-burger"
        aria-label="Abrir menú"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && portalTarget
        ? createPortal(
            <MobileMenu
              items={items}
              label={label}
              onClose={() => setOpen(false)}
              onNavigate={() => setOpen(false)}
            />,
            portalTarget,
          )
        : null}
    </>
  );
}
