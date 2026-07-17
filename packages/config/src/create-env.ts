import type { ZodObject, ZodRawShape, z } from "zod";

/**
 * Valida un slice de env vars con Zod. Si falta o es inválida alguna variable,
 * el proceso NO arranca (fail-fast) y el error dice exactamente qué falta.
 *
 * `values` permite pasar referencias explícitas (necesario para las
 * NEXT_PUBLIC_* de Next.js, que se inlinean en build y no se pueden leer
 * dinámicamente de process.env en el cliente).
 */
export function createEnv<T extends ZodRawShape>(
  schema: ZodObject<T>,
  values: Record<string, string | undefined> = process.env,
): z.infer<ZodObject<T>> {
  const parsed = schema.safeParse(values);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`❌ Variables de entorno inválidas:\n${issues}`);
    process.exit(1);
  }

  return parsed.data;
}
