import { z } from "zod";

// IA con Anthropic. Sin ANTHROPIC_API_KEY la IA queda deshabilitada (los
// endpoints degradan con un error claro) — igual que los demás drivers de infra.
// TODAS las tareas de IA usan Haiku (rápido y barato) salvo que se cambie el modelo.
const schema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),
});

const parsed = schema.safeParse(process.env);
export const aiEnv = parsed.success ? parsed.data : schema.parse({});
