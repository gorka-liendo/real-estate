import { z } from "zod";

// Habitaciones de un inmueble (para alquiler por habitaciones).

export const createRoomSchema = z.object({
  propertyId: z.uuid(),
  name: z.string().min(1, "El nombre de la habitación es obligatorio").max(120),
  areaM2: z.coerce.number().int().positive().max(10_000).optional(),
  refPrice: z.coerce.number().int().positive().max(1_000_000).optional(),
});

// Sin defaults (lección zod v4: .partial()/.default() re-aplicaría en PATCH).
export const updateRoomSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  areaM2: z.coerce.number().int().positive().max(10_000).nullable().optional(),
  refPrice: z.coerce.number().int().positive().max(1_000_000).nullable().optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
