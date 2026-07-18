// Throttle en memoria para el POST público de leads (defensa en profundidad,
// además del honeypot). Ventana fija por clave (tenant:ip). En producción
// migrar a Redis (@rep/queue ya trae IORedis) para que funcione multi-instancia.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();
let lastSweep = Date.now();

// Purga claves cuyos timestamps ya caducaron, para que el Map no crezca sin
// límite (una entrada por tenant:ip). Barre como mucho una vez por ventana.
function sweep(now: number): void {
  if (now - lastSweep < WINDOW_MS) return;
  for (const [k, arr] of hits) {
    const recent = arr.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) hits.delete(k);
    else hits.set(k, recent);
  }
  lastSweep = now;
}

export function allowLead(key: string): boolean {
  const now = Date.now();
  sweep(now);
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
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
