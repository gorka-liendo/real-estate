import Link from "next/link";

// Marca del header: logo del tenant (brand_config.logoUrl) si lo hay, con el
// nombre como fallback. Opcionalmente enlazable (ficha/portal → home).
export function TopbarBrand({
  name,
  logoUrl,
  href,
}: {
  name: string;
  logoUrl?: string;
  href?: string;
}) {
  const content = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="rt-topbar__logo" src={logoUrl} alt={name} />
  ) : (
    <span className="rt-topbar__brand">{name}</span>
  );

  return href ? (
    <Link href={href} className="rt-topbar__brandlink" aria-label={name}>
      {content}
    </Link>
  ) : (
    content
  );
}
