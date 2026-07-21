import { z } from "zod";

export const createRentalSchema = z.object({
  propertyId: z.uuid(),
  roomId: z.uuid().optional(), // habitación (alquiler por habitaciones); ausente = piso entero
  renterClientId: z.uuid().optional(),
  renterName: z.string().min(1, "El nombre del inquilino es obligatorio").max(200),
  monthlyRent: z.coerce.number().int().positive().max(1_000_000),
  startDate: z.coerce.date(),
  notes: z.string().max(2000).optional(),
});

// Sin defaults en update (lección zod v4: .default() se re-aplicaría en PATCH).
export const updateRentalSchema = z.object({
  status: z.enum(["active", "ended"]).optional(),
  endDate: z.coerce.date().nullable().optional(),
  monthlyRent: z.coerce.number().int().positive().max(1_000_000).optional(),
  notes: z.string().max(2000).optional(),
});

// Upsert del cobro de un mes (period va en la URL como YYYY-MM).
export const paymentSchema = z.object({
  status: z.enum(["pending", "paid"]),
  amount: z.coerce.number().int().positive().max(1_000_000).optional(),
  notes: z.string().max(500).optional(),
});

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type CreateRentalInput = z.infer<typeof createRentalSchema>;
export type UpdateRentalInput = z.infer<typeof updateRentalSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
