// Signature #7 — overlay móvil a pantalla completa; el orden es la única jerarquía.
export type MenuItem = { label: string; href: string };

export function MobileMenu({
  items,
  label = "Menu",
  onClose,
  onNavigate,
}: {
  items: MenuItem[];
  label?: string;
  onClose?: () => void;
  /** Se dispara al pulsar un enlace (p. ej. para cerrar el overlay). */
  onNavigate?: () => void;
}) {
  return (
    <nav className="rt-mobilemenu" aria-label={label}>
      {onClose ? (
        <button className="rt-mobilemenu__close" onClick={onClose} aria-label="Cerrar menú">
          ✕
        </button>
      ) : null}
      <div className="rt-mobilemenu__label">{label}</div>
      {items.map((item) => (
        <a href={item.href} key={item.href} onClick={onNavigate}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
