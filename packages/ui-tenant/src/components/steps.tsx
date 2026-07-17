// Signature #6 — pasos numerados (proceso), mismo tratamiento tipográfico display.
export type Step = { title: string; body: string };

export function Steps({ steps }: { steps: Step[] }) {
  return (
    <div className="rt-steps">
      {steps.map((step, i) => (
        <div className="rt-step" key={i}>
          <div className="rt-step__n">{String(i + 1).padStart(2, "0")}</div>
          <div className="rt-step__t">{step.title}</div>
          <p>{step.body}</p>
        </div>
      ))}
    </div>
  );
}
