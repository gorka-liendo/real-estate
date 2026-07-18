// Signature #8 — footer de 4 columnas + barra de copyright.
// `href` opcional: sin él, el ítem se pinta como texto plano (dirección, horario…).
export type FooterLink = { label: string; href?: string };
export type FooterColumn = { heading: string; links: FooterLink[] };

export function Footer({
  brandHeading,
  tagline,
  columns,
  logoUrl,
  bottomText,
}: {
  brandHeading: string;
  tagline?: string;
  columns: FooterColumn[];
  /** Logo de la inmobiliaria (brand_config.logoUrl) — sustituye al wordmark textual. */
  logoUrl?: string | null;
  /** Línea inferior (p. ej. "© 2026 Inmobiliaria Martínez · Todos los derechos reservados"). */
  bottomText?: string;
}) {
  return (
    <>
      <div className="rt-footer">
        <div>
          {logoUrl ? (
            <img className="rt-footer__logo" src={logoUrl} alt={brandHeading} />
          ) : (
            <div className="rt-footer__k">{brandHeading}</div>
          )}
          {tagline ? <p className="rt-footer__tagline">{tagline}</p> : null}
        </div>
        {columns.map((col) => (
          <div key={col.heading}>
            <div className="rt-footer__k">{col.heading}</div>
            {col.links.map((link) =>
              link.href ? (
                <a href={link.href} key={`${link.label}-${link.href}`}>
                  {link.label}
                </a>
              ) : (
                <p key={link.label}>{link.label}</p>
              ),
            )}
          </div>
        ))}
      </div>
      {bottomText ? <div className="rt-footer__bottom">{bottomText}</div> : null}
    </>
  );
}
