import { z } from "zod";

const CATEGORY_VALUES = [
  "water",
  "electricity",
  "gas",
  "community",
  "taxes",
  "derrama",
  "maintenance",
  "insurance",
  "management_fee",
  "commission",
  "other",
] as const;

// Gasto (direction='expense'). Llega como multipart (campos + factura opcional).
// `status`: 'paid' (por defecto, como el flujo de gasto rápido de siempre — se
// registra un pago por el total) o 'pending' (factura recibida sin pagar aún).
export const createExpenseSchema = z.object({
  propertyId: z.uuid().optional(), // opcional a propósito: gasto general de la agencia
  roomId: z.uuid().optional(), // habitación concreta del inmueble (opcional)
  clientId: z.uuid().optional(),
  vendorName: z.string().max(200).optional(),
  category: z.enum(CATEGORY_VALUES).default("other"),
  concept: z.string().max(200).optional(),
  amount: z.coerce.number().positive().max(1_000_000), // euros con decimales
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["pending", "paid"]).default("paid"),
  notes: z.string().max(1000).optional(),
});

// Factura emitida (direction='income'). JSON — el PDF se genera al emitir, no
// se sube. taxRatePercent en porcentaje (21 = 21%) → se guarda en bps.
export const createIncomeSchema = z.object({
  propertyId: z.uuid().optional(),
  roomId: z.uuid().optional(), // habitación concreta del inmueble (opcional)
  clientId: z.uuid().optional(), // a quién se factura — recomendado, no forzado
  rentalId: z.uuid().optional(),
  category: z.enum(CATEGORY_VALUES).default("management_fee"),
  concept: z.string().min(1, "El concepto es obligatorio").max(200),
  amount: z.coerce.number().positive().max(1_000_000), // subtotal en euros
  taxRatePercent: z.coerce.number().min(0).max(100).default(21),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(1000).optional(),
});

// Update: SIN defaults (zod v4 los re-aplicaría en cada PATCH parcial — lección
// aprendida en clients/properties). Todos los campos son editables — el
// servicio bloquea tocar importe/IVA si la factura ya tiene pagos registrados
// (evitaría descuadrar lo ya cobrado), pero concepto/fechas/vínculos/notas y
// el estado siguen editables siempre.
export const updateInvoiceSchema = z.object({
  propertyId: z.uuid().nullable().optional(),
  roomId: z.uuid().nullable().optional(),
  clientId: z.uuid().nullable().optional(),
  rentalId: z.uuid().nullable().optional(),
  vendorName: z.string().max(200).nullable().optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  concept: z.string().max(200).optional(),
  amount: z.coerce.number().positive().max(1_000_000).optional(),
  taxRatePercent: z.coerce.number().min(0).max(100).optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["draft", "pending", "paid", "cancelled"]).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const createPaymentSchema = z.object({
  amount: z.coerce.number().positive().max(1_000_000), // euros
  paidAt: z.coerce.date().optional(), // por defecto ahora
  method: z.enum(["transfer", "cash", "card", "other"]).default("transfer"),
  notes: z.string().max(500).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
