import Link from "next/link";

// Marca del header. `mode` (site_config.headerBrand): "text" → siempre el
// nombre; "logo"/undefined → el logo del tenant (brand_config.logoUrl) con el
// nombre como fallback si no hay logo. Opcionalmente enlazable (ficha/portal → home).
export function TopbarBrand({
  name,
  logoUrl,
  mode,
  href,
}: {
  name: string;
  logoUrl?: string;
  mode?: "logo" | "text";
  href?: string;
}) {
  const useLogo = mode !== "text" && Boolean(logoUrl);
  const content = useLogo ? (
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
