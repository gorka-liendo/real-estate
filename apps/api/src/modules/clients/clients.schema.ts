import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(200),
  email: z.email().optional().or(z.literal("")).transform((v) => v || undefined),
  phone: z.string().max(40).optional(),
  stage: z.enum(["lead", "active", "closed"]).default("lead"),
  notes: z.string().max(2000).optional(),
});

// OJO: .partial() NO basta — en zod v4 el .default("lead") de stage se
// re-aplicaría en cualquier PATCH parcial (p. ej. editar solo las notas
// degradaría un cliente 'active' a 'lead'). Enum opcional SIN default.
export const updateClientSchema = createClientSchema.partial().extend({
  stage: z.enum(["lead", "active", "closed"]).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
