import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

// Signature #5 — botón píldora, único elemento redondeado del sistema.
type Variant = "solid" | "outline";

function classes(variant: Variant, extra?: string) {
  return ["rt-btn", variant === "outline" ? "rt-btn--outline" : "", extra]
    .filter(Boolean)
    .join(" ");
}

export function PillButton({
  children,
  variant = "solid",
  className,
  ...rest
}: { children: ReactNode; variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={classes(variant, className)} {...rest}>
      {children}
    </button>
  );
}

export function PillLink({
  children,
  variant = "solid",
  className,
  ...rest
}: { children: ReactNode; variant?: Variant } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={classes(variant, className)} {...rest}>
      {children}
    </a>
  );
}
