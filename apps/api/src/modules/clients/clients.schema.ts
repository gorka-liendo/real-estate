import { z } from "zod";

const KIND_VALUES = ["owner", "renter", "buyer", "seeker", "other"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const optStr = (max: number) =>
  z.string().max(max).optional().or(z.literal("")).transform((v) => v || undefined);

export const createClientSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(200),
  email: z.email().optional().or(z.literal("")).transform((v) => v || undefined),
  phone: z.string().max(40).optional(),
  // Contacto ampliado.
  secondaryPhone: optStr(40),
  language: optStr(10),
  birthday: z.string().regex(DATE_RE).optional().or(z.literal("")).transform((v) => v || undefined),
  // Facturación.
  company: optStr(200),
  taxId: optStr(40),
  address: optStr(300),
  // Segmentación.
  tags: z.array(z.string().min(1).max(40)).max(30).optional(),
  stage: z.enum(["lead", "active", "closed"]).default("lead"),
  kind: z.enum(KIND_VALUES).optional(),
  // Cuota mensual acordada, en euros con decimales → céntimos en la ruta.
  monthlyFeeCents: z.coerce.number().int().nonnegative().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

// OJO: .partial() NO basta — en zod v4 el .default("lead") de stage se
// re-aplicaría en cualquier PATCH parcial (p. ej. editar solo las notas
// degradaría un cliente 'active' a 'lead'). Enum opcional SIN default.
export const updateClientSchema = createClientSchema.partial().extend({
  stage: z.enum(["lead", "active", "closed"]).optional(),
  kind: z.enum(KIND_VALUES).optional(),
});

export const createNoteSchema = z.object({
  body: z.string().min(1, "La nota no puede estar vacía").max(2000),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
