import { z } from "zod";
import { createEnv } from "./create-env.js";

// Las NEXT_PUBLIC_* se inlinean en build: hay que referenciarlas explícitamente,
// nunca leerlas con process.env[clave] dinámico.
export const dashboardEnv = createEnv(
  z.object({
    NEXT_PUBLIC_API_URL: z.url(),
  }),
  {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
);
