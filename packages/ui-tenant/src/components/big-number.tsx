import type { ReactNode } from "react";

// Signature #3 — número gigante decorativo de fondo que ancla una cita/principio.
export function BigNumber({
  number,
  quote,
  children,
}: {
  number: string;
  quote?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rt-bignumber">
      <div className="rt-bignumber__n" aria-hidden="true">
        {number}
      </div>
      <div className="rt-bignumber__body">
        {quote ? <div className="rt-bignumber__quote">{quote}</div> : null}
        {children}
      </div>
    </div>
  );
}
