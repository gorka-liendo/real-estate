import type { TextareaHTMLAttributes } from "react";
import { cn } from "../cn.js";

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("du-textarea", className)} {...rest} />;
}
