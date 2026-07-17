import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.js";

export type ButtonVariant = "solid" | "outline" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

function classes(variant: ButtonVariant, size: ButtonSize, extra?: string) {
  return cn(
    "du-btn",
    `du-btn--${variant}`,
    size === "sm" && "du-btn--sm",
    extra,
  );
}

type BaseProps = { variant?: ButtonVariant; size?: ButtonSize; children: ReactNode };

export function Button({
  variant = "solid",
  size = "md",
  className,
  children,
  ...rest
}: BaseProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={classes(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "solid",
  size = "md",
  className,
  children,
  ...rest
}: BaseProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={classes(variant, size, className)} {...rest}>
      {children}
    </a>
  );
}
