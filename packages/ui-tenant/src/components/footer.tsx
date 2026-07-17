// Signature #8 — footer de 4 columnas.
export type FooterLink = { label: string; href: string };
export type FooterColumn = { heading: string; links: FooterLink[] };

export function Footer({
  brandHeading,
  tagline,
  columns,
}: {
  brandHeading: string;
  tagline?: string;
  columns: FooterColumn[];
}) {
  return (
    <div className="rt-footer">
      <div>
        <div className="rt-footer__k">{brandHeading}</div>
        {tagline ? <p className="rt-footer__tagline">{tagline}</p> : null}
      </div>
      {columns.map((col) => (
        <div key={col.heading}>
          <div className="rt-footer__k">{col.heading}</div>
          {col.links.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}
