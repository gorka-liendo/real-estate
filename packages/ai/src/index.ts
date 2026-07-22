import { aiEnv } from "./env.js";

// Capa fina sobre el SDK de Anthropic. El SDK se carga de forma PEREZOSA (sin
// API key no se importa). Modelo por defecto: Haiku (todas las tareas de IA).

export { aiEnv } from "./env.js";

/** ¿Está la IA configurada (hay API key)? Los módulos gatean sus features con esto. */
export function isAiConfigured(): boolean {
  return Boolean(aiEnv.ANTHROPIC_API_KEY);
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("IA no configurada (falta ANTHROPIC_API_KEY)");
    this.name = "AiNotConfiguredError";
  }
}

// Un adjunto (imagen o PDF) para que la IA lo lea.
export type AiFile = { data: Buffer; mimeType: string };

// Definición de la "herramienta" cuyo input es la salida ESTRUCTURADA que queremos.
export type AiTool<T> = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
  // valida/normaliza el input crudo del modelo antes de devolverlo
  parse: (raw: unknown) => T;
};

/**
 * Extrae datos ESTRUCTURADOS de un documento/imagen usando Haiku + tool-use
 * forzado (el modelo devuelve el input de la herramienta = nuestro objeto).
 */
export async function extractFromFile<T>(opts: {
  instruction: string;
  file: AiFile;
  tool: AiTool<T>;
  system?: string;
}): Promise<T> {
  if (!aiEnv.ANTHROPIC_API_KEY) throw new AiNotConfiguredError();
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: aiEnv.ANTHROPIC_API_KEY });

  const base64 = opts.file.data.toString("base64");
  const isPdf = opts.file.mimeType === "application/pdf";
  const block = isPdf
    ? ({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      } as const)
    : ({
        type: "image",
        source: {
          type: "base64",
          media_type: opts.file.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: base64,
        },
      } as const);

  const res = await client.messages.create({
    model: aiEnv.ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: opts.system,
    tools: [
      {
        name: opts.tool.name,
        description: opts.tool.description,
        input_schema: opts.tool.inputSchema as never,
      },
    ],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [
      {
        role: "user",
        content: [block as never, { type: "text", text: opts.instruction }],
      },
    ],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("La IA no devolvió datos estructurados.");
  }
  return opts.tool.parse(toolUse.input);
}
