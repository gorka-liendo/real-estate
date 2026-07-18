// Throttle en memoria para el POST público de leads (defensa en profundidad,
// además del honeypot). Ventana fija por clave. En producción migrar a Redis
// (@rep/queue ya trae IORedis) para que funcione multi-instancia.
//
// Se combinan dos límites (ver leads.routes.ts):
//   - por tenant:ip → freno fino por cliente (la ip puede venir de un header
//     spoofeable, así que es best-effort).
//   - por tenant    → tope global NO evadible: la clave la deriva el servidor
//     del contexto, no del cliente, así que rotar x-forwarded-for no lo salta.
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
let lastSweep = Date.now();

// Purga claves cuyos timestamps ya caducaron, para que el Map no crezca sin
// límite (una entrada por clave). Barre como mucho una vez por ventana.
function sweep(now: number): void {
  if (now - lastSweep < WINDOW_MS) return;
  for (const [k, arr] of hits) {
    const recent = arr.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) hits.delete(k);
    else hits.set(k, recent);
  }
  lastSweep = now;
}

// Registra un intento en `key` y responde si sigue dentro de `max` por ventana.
export function allowLead(key: string, max: number): boolean {
  const now = Date.now();
  sweep(now);
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

// Solo para tests: reinicia el contador (evita acoplar tests al estado global).
export function resetLeadThrottle(): void {
  hits.clear();
  lastSweep = Date.now();
}
