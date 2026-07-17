import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.js";

export function Card({
  className,
  padded = true,
  children,
  ...rest
}: { padded?: boolean; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("du-card", padded && "du-card__pad", className)} {...rest}>
      {children}
    </div>
  );
}
