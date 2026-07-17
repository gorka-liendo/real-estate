// Signature #1 — wordmark de gran formato que sangra el borde.
export function WordmarkBleed({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return <div className={["rt-wordmark", className].filter(Boolean).join(" ")}>{text}</div>;
}
