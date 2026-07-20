import PDFDocument from "pdfkit";
import type { Tenant } from "@rep/db";
import type { InvoiceWithPayments } from "./invoices.service.js";

const eur = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  pending: "Pendiente de cobro",
  paid: "Pagada",
  cancelled: "Anulada",
};

export type InvoicePdfContext = {
  clientName?: string;
  clientEmail?: string;
  propertyTitle?: string;
};

// Genera el PDF de una factura EMITIDA (income). Branding solo texto en v1
// (sin logo — evita depender de una descarga de imagen remota en caliente).
export function renderInvoicePdf(
  invoice: InvoiceWithPayments,
  tenant: Tenant,
  ctx: InvoicePdfContext,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(tenant.name, { continued: false });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#555");
    if (tenant.siteConfig.contactEmail) doc.text(tenant.siteConfig.contactEmail);
    if (tenant.siteConfig.contactPhone) doc.text(tenant.siteConfig.contactPhone);
    doc.fillColor("#000");

    doc.moveDown(1.5);
    doc.fontSize(16).text(`Factura ${invoice.number ?? ""}`);
    doc.fontSize(10).fillColor("#555");
    doc.text(`Fecha de emisión: ${invoice.issueDate}`);
    if (invoice.dueDate) doc.text(`Vencimiento: ${invoice.dueDate}`);
    doc.text(`Estado: ${STATUS_LABELS[invoice.status] ?? invoice.status}`);
    doc.fillColor("#000");

    if (ctx.clientName || ctx.propertyTitle) {
      doc.moveDown(1);
      doc.fontSize(12).text("Datos", { underline: true });
      doc.fontSize(10);
      if (ctx.clientName) doc.text(`Cliente: ${ctx.clientName}`);
      if (ctx.clientEmail) doc.text(`Email: ${ctx.clientEmail}`);
      if (ctx.propertyTitle) doc.text(`Inmueble: ${ctx.propertyTitle}`);
    }

    doc.moveDown(1.5);
    const top = doc.y;
    doc.fontSize(10).fillColor("#555");
    doc.text("Concepto", 50, top, { width: 280 });
    doc.text("Base", 340, top, { width: 70, align: "right" });
    doc.text("IVA", 410, top, { width: 60, align: "right" });
    doc.text("Total", 470, top, { width: 75, align: "right" });
    doc.fillColor("#000");
    doc.moveTo(50, top + 16).lineTo(545, top + 16).strokeColor("#ccc").stroke();

    const rowY = top + 24;
    doc.fontSize(10);
    doc.text(invoice.concept ?? "—", 50, rowY, { width: 280 });
    doc.text(eur(invoice.subtotalCents), 340, rowY, { width: 70, align: "right" });
    doc.text(`${(invoice.taxRateBps / 100).toFixed(2)}%`, 410, rowY, { width: 60, align: "right" });
    doc.text(eur(invoice.totalCents), 470, rowY, { width: 75, align: "right" });

    doc.moveTo(50, rowY + 24).lineTo(545, rowY + 24).strokeColor("#ccc").stroke();

    doc.fontSize(12).text(`Total: ${eur(invoice.totalCents)}`, 340, rowY + 34, {
      width: 205,
      align: "right",
    });

    if (invoice.notes) {
      doc.moveDown(3);
      doc.fontSize(10).fillColor("#555").text(invoice.notes);
      doc.fillColor("#000");
    }

    doc.end();
  });
}
