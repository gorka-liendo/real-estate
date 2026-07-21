"use client";

import { useEffect } from "react";

// Marca `.is-scrolled` en el header al hacer scroll (>40px). Lo usa el estilo
// "transparent" para pasar de transparente sobre el hero a cristal con texto
// oscuro (animación fina, transiciones en CSS). Inofensivo para los otros
// estilos (no tienen reglas `.is-scrolled`). En páginas SIN hero (ficha/portal)
// fuerza `.is-scrolled` desde el inicio para que el header transparente sea
// legible sobre el fondo claro.
export function HeaderScroll() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".rt-topbar");
    if (!header) return;

    if (!document.querySelector(".rt-hero")) {
      header.classList.add("is-scrolled");
      return;
    }

    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return null;
}
