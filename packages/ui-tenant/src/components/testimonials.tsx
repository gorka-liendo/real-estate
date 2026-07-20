// Rejilla de testimonios (cita + autor). Prueba social en estética Dwell,
// 100% tokens --tenant-*. Se alimenta de la sección "testimonials".
export type Testimonial = { quote: string; author: string; role?: string };

export function Testimonials({ items }: { items: Testimonial[] }) {
  return (
    <div className="rt-testimonials">
      {items.map((t, i) => (
        <figure className="rt-testimonial" key={i}>
          <blockquote className="rt-testimonial__quote">{t.quote}</blockquote>
          <figcaption className="rt-testimonial__author">
            {t.author}
            {t.role ? <span className="rt-testimonial__role"> · {t.role}</span> : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
