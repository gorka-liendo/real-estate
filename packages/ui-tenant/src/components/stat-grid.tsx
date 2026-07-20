// Rejilla de cifras clave (valor grande + etiqueta). Tratamiento display de la
// familia Dwell, 100% con tokens --tenant-*. Se alimenta de la sección "stats".
export type Stat = { value: string; label: string };

export function StatGrid({ items }: { items: Stat[] }) {
  return (
    <div className="rt-stats">
      {items.map((s, i) => (
        <div className="rt-stat" key={i}>
          <div className="rt-stat__v">{s.value}</div>
          <div className="rt-stat__l">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
