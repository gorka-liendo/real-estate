// Preguntas frecuentes: acordeón nativo (<details>/<summary>) — sin JS, SSR y
// accesible. 100% tokens --tenant-*. Se alimenta de la sección "faq".
export type FaqEntry = { question: string; answer: string };

export function Faq({ items }: { items: FaqEntry[] }) {
  return (
    <div className="rt-faq">
      {items.map((f, i) => (
        <details className="rt-faq__item" key={i}>
          <summary className="rt-faq__q">{f.question}</summary>
          <p className="rt-faq__a">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}
