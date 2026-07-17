import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.js";

export type BadgeVariant = "default" | "success" | "danger" | "muted";

export function Badge({
  variant = "default",
  className,
  children,
  ...rest
}: { variant?: BadgeVariant; children: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("du-badge", variant !== "default" && `du-badge--${variant}`, className)}
      {...rest}
    >
      {children}
    </span>
  );
}
