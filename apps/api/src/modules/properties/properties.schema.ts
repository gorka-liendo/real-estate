import { z } from "zod";

const optionalInt = z.coerce.number().int().nonnegative().optional();

const detailsSchema = z
  .object({
    reference: z.string().max(60).optional(),
    subtype: z.string().max(40).optional(),
    condition: z.enum(["new", "good", "renew"]).optional(),
    floor: z.string().max(20).optional(),
    exterior: z.boolean().optional(),
    furnished: z.boolean().optional(),
    equippedKitchen: z.boolean().optional(),
    energyCert: z.string().max(4).optional(),
    yearBuilt: z.coerce.number().int().min(1800).max(2100).optional(),
    usableM2: optionalInt,
    province: z.string().max(120).optional(),
    neighborhood: z.string().max(120).optional(),
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
  })
  .optional();

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
  features: z.array(z.string().max(40)).max(40).optional(),
  details: detailsSchema,
});

export const updatePropertySchema = createPropertySchema.partial();

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
