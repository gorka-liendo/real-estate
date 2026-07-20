import { z } from "zod";
import { createEnv } from "./create-env.js";

export const tenantSiteEnv = createEnv(
  z.object({
    NEXT_PUBLIC_API_URL: z.url(),
    // Raíz de la plataforma para resolver subdominios (martinez.<root>).
    // "localhost" se acepta siempre en dev; en prod se fija al dominio real.
    NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(1).default("plataforma.app"),
  }),
  {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
  },
);
