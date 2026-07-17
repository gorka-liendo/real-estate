import { z } from "zod";
import { createEnv } from "./create-env.js";

export const workersEnv = createEnv(
  z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // REDIS_URL llegará en Fase E, cuando se levanten las colas BullMQ.
  }),
);
