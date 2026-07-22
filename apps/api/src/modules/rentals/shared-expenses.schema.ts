import { z } from "zod";

const TYPES = ["electricity", "water", "gas", "internet", "community", "heating", "other"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Gasto compartido a repartir entre los inquilinos por días de solape con el periodo.
export const createSharedExpenseSchema = z
  .object({
    propertyId: z.uuid(),
    type: z.enum(TYPES).default("electricity"),
    concept: z.string().max(200).optional(),
    periodStart: z.string().regex(DATE_RE),
    periodEnd: z.string().regex(DATE_RE),
    amount: z.coerce.number().positive().max(1_000_000), // euros con decimales
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: "El fin del periodo no puede ser anterior al inicio",
    path: ["periodEnd"],
  });

// Update: sin defaults (lección zod v4). Todo opcional.
export const updateSharedExpenseSchema = z.object({
  type: z.enum(TYPES).optional(),
  concept: z.string().max(200).nullable().optional(),
  periodStart: z.string().regex(DATE_RE).optional(),
  periodEnd: z.string().regex(DATE_RE).optional(),
  amount: z.coerce.number().positive().max(1_000_000).optional(),
});

// Visibilidad de la liquidación (la controla la inmobiliaria).
export const shareConfigSchema = z.object({
  propertyId: z.uuid(),
  ownerVisible: z.boolean().optional(),
  tenantShared: z.boolean().optional(),
});

export type CreateSharedExpenseInput = z.infer<typeof createSharedExpenseSchema>;
export type UpdateSharedExpenseInput = z.infer<typeof updateSharedExpenseSchema>;
