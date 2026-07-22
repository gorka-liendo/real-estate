import { extractFromFile, type AiTool } from "@rep/ai";
import type { SharedExpenseType } from "@rep/db";

// Extracción de los datos de una factura de suministro (luz, agua…) con IA
// (Haiku) para pre-rellenar el reparto. El agente SIEMPRE revisa antes de guardar.

const TYPES: SharedExpenseType[] = [
  "electricity",
  "water",
  "gas",
  "internet",
  "community",
  "heating",
  "other",
];

export type ExtractedExpense = {
  type: SharedExpenseType | null;
  concept: string | null;
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null;
  amount: number | null; // euros
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const cleanDate = (v: unknown): string | null =>
  typeof v === "string" && DATE_RE.test(v) ? v : null;
const cleanStr = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null;
const cleanNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

const TOOL: AiTool<ExtractedExpense> = {
  name: "registrar_factura",
  description:
    "Registra los datos de una factura de suministro de un piso para repartir el gasto entre inquilinos.",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: TYPES,
        description:
          "Tipo de suministro: electricity (luz), water (agua), gas, internet, community (comunidad), heating (calefacción) u other.",
      },
      concept: { type: "string", description: "Proveedor o concepto, p. ej. 'Iberdrola' o 'Aguas de Bilbao'." },
      periodStart: { type: "string", description: "Inicio del periodo facturado, formato YYYY-MM-DD." },
      periodEnd: { type: "string", description: "Fin del periodo facturado, formato YYYY-MM-DD." },
      amount: { type: "number", description: "Importe TOTAL a pagar en euros, IVA incluido (número, sin símbolo)." },
    },
    required: [],
  },
  parse: (raw): ExtractedExpense => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const type = typeof r.type === "string" && (TYPES as string[]).includes(r.type)
      ? (r.type as SharedExpenseType)
      : null;
    return {
      type,
      concept: cleanStr(r.concept),
      periodStart: cleanDate(r.periodStart),
      periodEnd: cleanDate(r.periodEnd),
      amount: cleanNum(r.amount),
    };
  },
};

export function extractSharedExpense(file: { data: Buffer; mimeType: string }): Promise<ExtractedExpense> {
  return extractFromFile({
    file,
    tool: TOOL,
    system:
      "Eres un asistente que lee facturas de suministros (luz, agua, gas…) de pisos en España. " +
      "Extraes con precisión el tipo, el proveedor, el PERIODO facturado (fechas de inicio y fin) y el " +
      "importe TOTAL a pagar con IVA. Si un dato no aparece con claridad, déjalo vacío en vez de inventarlo.",
    instruction:
      "Extrae los datos de esta factura para repartir el gasto entre los inquilinos del piso. " +
      "Devuelve las fechas del periodo facturado en formato YYYY-MM-DD y el importe total en euros.",
  });
}
