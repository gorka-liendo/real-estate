import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "../cn.js";

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("du-input", className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("du-select", className)} {...rest}>
      {children}
    </select>
  );
}

export function Label({
  className,
  children,
  ...rest
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("du-label", className)} {...rest}>
      {children}
    </label>
  );
}
