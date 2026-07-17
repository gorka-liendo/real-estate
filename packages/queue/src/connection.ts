import { Redis } from "ioredis";
import { queueEnv } from "./env.js";

// Conexión IORedis singleton, creada de forma perezosa (solo si hay REDIS_URL).
// Importar este módulo NO abre ninguna conexión.
let connection: Redis | null | undefined;

export function getConnection(): Redis | null {
  if (connection !== undefined) return connection;
  connection = queueEnv.REDIS_URL
    ? new Redis(queueEnv.REDIS_URL, { maxRetriesPerRequest: null })
    : null;
  return connection;
}

export async function closeConnection() {
  if (connection) await connection.quit();
  connection = undefined;
}
