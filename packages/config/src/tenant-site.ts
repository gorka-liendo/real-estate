import { z } from "zod";
import { createEnv } from "./create-env.js";

export const tenantSiteEnv = createEnv(
  z.object({
    NEXT_PUBLIC_API_URL: z.url(),
    // ROOT_DOMAIN llegará en Fase D (resolución de tenant por Host header).
  }),
  {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
);
