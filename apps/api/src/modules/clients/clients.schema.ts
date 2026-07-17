import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(200),
  email: z.email().optional().or(z.literal("")).transform((v) => v || undefined),
  phone: z.string().max(40).optional(),
  stage: z.enum(["lead", "active", "closed"]).default("lead"),
  notes: z.string().max(2000).optional(),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
