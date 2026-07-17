import { cn } from "../cn.js";

/** Toggle on/off accesible (button role=switch). Color solo para el estado activo. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-checked={checked}
      className={cn("du-switch", className)}
    >
      <span className="du-switch__thumb" />
    </button>
  );
}
