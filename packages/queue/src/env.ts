import { z } from "zod";

// Redis es OPCIONAL en local: sin REDIS_URL, la cola queda deshabilitada
// (enqueue → no-op, workers idle). En producción se define y todo se activa.
const parsed = z
  .object({
    REDIS_URL: z.string().startsWith("redis").optional(),
    QUEUE_PREFIX: z.string().default("rep"),
  })
  .safeParse(process.env);

// nunca fail-fast por Redis: si el schema fallara, seguimos sin cola
export const queueEnv = parsed.success
  ? parsed.data
  : { REDIS_URL: undefined, QUEUE_PREFIX: "rep" };

export const isQueueEnabled = Boolean(queueEnv.REDIS_URL);
