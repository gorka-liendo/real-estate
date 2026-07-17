import { Queue, Worker, type Job, type Processor } from "bullmq";
import { closeConnection, getConnection } from "./connection.js";
import { isQueueEnabled, queueEnv } from "./env.js";

export { isQueueEnabled } from "./env.js";
export { closeConnection } from "./connection.js";
export type { Job } from "bullmq";

/**
 * Catálogo de colas y el payload de cada una. Al añadir una cola nueva,
 * declararla aquí para tener tipado en enqueue() y registerWorker().
 */
export type JobData = {
  media: { tenantId: string; assetKey: string; op: "resize" | "optimize" };
  email: { to: string; template: string; vars: Record<string, unknown> };
};
export type QueueName = keyof JobData;

const queues = new Map<QueueName, Queue>();

function getQueue<N extends QueueName>(name: N): Queue | null {
  const connection = getConnection();
  if (!connection) return null;
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection, prefix: queueEnv.QUEUE_PREFIX });
    queues.set(name, q);
  }
  return q;
}

/**
 * Encola un job. Sin Redis (local) hace no-op y devuelve false — así el resto
 * del código funciona igual con o sin cola configurada.
 */
export async function enqueue<N extends QueueName>(
  name: N,
  data: JobData[N],
  jobName = "default",
): Promise<boolean> {
  const q = getQueue(name);
  if (!q) {
    console.warn(`[queue] '${name}' sin Redis — job descartado (no-op en local)`);
    return false;
  }
  await q.add(jobName, data);
  return true;
}

/**
 * Registra un worker para una cola (lo usa la app `workers`).
 * Sin Redis devuelve null y no arranca nada.
 */
export function registerWorker<N extends QueueName>(
  name: N,
  processor: (job: Job<JobData[N]>) => Promise<void>,
): Worker | null {
  const connection = getConnection();
  if (!connection) {
    console.warn(`[queue] worker '${name}' no arranca — sin REDIS_URL`);
    return null;
  }
  return new Worker(name, processor as Processor, {
    connection,
    prefix: queueEnv.QUEUE_PREFIX,
  });
}

/** Cierra colas y conexión (tests / shutdown). */
export async function closeQueues() {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
  await closeConnection();
}

/** Estado legible para logs de arranque. */
export const queueStatus = () =>
  isQueueEnabled ? "enabled (Redis)" : "disabled (local, no-op)";
