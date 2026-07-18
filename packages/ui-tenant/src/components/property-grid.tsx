// Grid de propiedades del micrositio (estética Dwell). Presentacional: recibe
// strings ya formateados (meta, price) para no acoplar el DS a la lógica de negocio.
export type Listing = {
  id: string;
  title: string;
  meta: string; // p.ej. "Piso · Bilbao · 95 m²"
  price: string; // p.ej. "320.000 €"
  imageUrl?: string;
  href?: string;
};

function Card({ item }: { item: Listing }) {
  const inner = (
    <>
      {item.imageUrl ? (
        <img
          className="rt-listing__img"
          src={item.imageUrl}
          alt={item.title}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="rt-listing__img" role="img" aria-label={item.title} />
      )}
      <div className="rt-listing__body">
        <h3 className="rt-listing__title">{item.title}</h3>
        <div className="rt-listing__meta">{item.meta}</div>
        <div className="rt-listing__price">{item.price}</div>
      </div>
    </>
  );
  return item.href ? (
    <a className="rt-listing" href={item.href}>
      {inner}
    </a>
  ) : (
    <div className="rt-listing">{inner}</div>
  );
}

export function PropertyGrid({ items }: { items: Listing[] }) {
  return (
    <div className="rt-listings">
      {items.map((item) => (
        <Card key={item.id} item={item} />
      ))}
    </div>
  );
}
