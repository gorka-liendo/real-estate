// Landing de la plataforma (Host sin subdominio de tenant).
export default function PlatformLanding() {
  return (
    <main
      className="rt-root"
      style={{ maxWidth: 640, margin: "0 auto", padding: "96px 24px", minHeight: "100vh" }}
    >
      <h1 style={{ fontFamily: "var(--tenant-font-display)", fontWeight: 800 }}>
        Real Estate Platform
      </h1>
      <p style={{ color: "var(--tenant-muted)" }}>
        Cada inmobiliaria tiene su micrositio en su propio subdominio.
      </p>
    </main>
  );
}
