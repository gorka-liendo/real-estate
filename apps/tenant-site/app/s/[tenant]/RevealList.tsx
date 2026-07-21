"use client";

import { domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";
import { Children, type ReactNode } from "react";

// Aparición sutil de cada sección al entrar en viewport (una sola vez).
// - Motion con LazyMotion(domAnimation): carga solo el feature-set mínimo →
//   bundle pequeño (no el ~34KB del import completo).
// - Respeta prefers-reduced-motion: si está activo, no anima (contenido visible).
// Envuelve cada hijo (una sección server-rendered) en un m.div animado.
const variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 0.61, 0.24, 1] as const },
  },
};

export function RevealList({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;

  return (
    <LazyMotion features={domAnimation} strict>
      {Children.map(children, (child) => (
        <m.div
          variants={variants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "0px 0px -12% 0px" }}
        >
          {child}
        </m.div>
      ))}
    </LazyMotion>
  );
}
