"use client";

import { useEffect } from "react";

// Animación de aparición al hacer scroll (progressive enhancement): solo con JS
// y SIN prefers-reduced-motion activamos el estado inicial oculto (marcando
// `data-reveal-on` en la raíz) y revelamos cada sección al entrar en viewport.
// Sin JS o con motion reducido, todo queda visible desde el principio.
export function RevealObserver() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".rt-root");
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(".rt-section, .rt-hero"));
    if (targets.length === 0) return;

    root.setAttribute("data-reveal-on", "");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
