// Signature #2 — about en dos columnas (challenge / approach).
export type AboutColumn = { title: string; body: string };

export function AboutColumns({ columns }: { columns: [AboutColumn, AboutColumn] }) {
  return (
    <div className="rt-about">
      {columns.map((col, i) => (
        <div className="rt-about__col" key={i}>
          <h3>{col.title}</h3>
          <p>{col.body}</p>
        </div>
      ))}
    </div>
  );
}
