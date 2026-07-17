import { z } from "zod";

const optionalInt = z.coerce.number().int().nonnegative().optional();

export const createPropertySchema = z.object({
  title: z.string().min(1, "El título es obligatorio").max(200),
  description: z.string().max(4000).optional(),
  operation: z.enum(["sale", "rent"]).default("sale"),
  kind: z.enum(["flat", "house", "commercial", "land", "garage"]).default("flat"),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  price: optionalInt,
  bedrooms: optionalInt,
  bathrooms: optionalInt,
  areaM2: optionalInt,
  city: z.string().max(120).optional(),
  address: z.string().max(240).optional(),
});

export const updatePropertySchema = createPropertySchema.partial();

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
