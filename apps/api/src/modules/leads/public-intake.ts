import type { Context } from "hono";
import { allowLead } from "./leads.throttle.js";

// Guard COMPARTIDO de los endpoints públicos de captación (leads, valuations…).
// Vive en un solo sitio a propósito: la cuota es global por tenant entre TODOS
// los formularios públicos (un bot no gana cupo extra alternando formularios),
// y ese invariante debe ser mecanismo, no un comentario en dos archivos.
const MAX_PER_IP = 5;
const MAX_PER_TENANT = 30;

/**
 * IP del cliente. OJO: x-forwarded-for es falsificable si la API no está detrás
 * de un proxy de confianza; por eso el límite por-ip es best-effort y el tope
 * por tenant (clave derivada del servidor) es el que de verdad frena el flood.
 * Endurecer el parsing (proxy hops de Railway) aquí aplica a todos los endpoints.
 */
export function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** true si la petición entra en cuota (registra el intento en ambos buckets). */
export function allowPublicCapture(tenantId: string, ip: string): boolean {
  return (
    allowLead(`ip:${tenantId}:${ip}`, MAX_PER_IP) &&
    allowLead(`tenant:${tenantId}`, MAX_PER_TENANT)
  );
}
