import PDFDocument from "pdfkit";
import type { SharedExpenseType, Tenant } from "@rep/db";
import type { PropertySettlement } from "./shared-expenses.service.js";

// ---------- helpers de color ----------
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const readableOn = (hex: string) => (luminance(hex) > 0.5 ? "#111111" : "#ffffff");
function mix(hex: string, withHex: string, ratio: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(withHex);
  const c = a.map((v, i) => Math.round(v * (1 - ratio) + b[i]! * ratio));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const eur = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

const TYPE_LABEL: Record<SharedExpenseType, string> = {
  electricity: "Luz",
  water: "Agua",
  gas: "Gas",
  internet: "Internet",
  community: "Comunidad",
  heating: "Calefacción",
  other: "Otros",
};
// Color por tipo (para los puntos/chips del desglose).
const TYPE_COLOR: Record<SharedExpenseType, string> = {
  electricity: "#f59e0b",
  water: "#3b82f6",
  gas: "#f97316",
  internet: "#8b5cf6",
  community: "#10b981",
  heating: "#ef4444",
  other: "#64748b",
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
};

const PAGE_W = 595.28;
const LEFT = 50;
const RIGHT = 545;
const WIDTH = RIGHT - LEFT;
const INK = "#0f172a"; // texto principal
const MUTED = "#64748b"; // texto secundario
const LINE = "#e2e8f0"; // líneas suaves

// PDF de la liquidación de gastos compartidos de un piso (para pasar a inquilinos).
export function renderSettlementPdf(
  settlement: PropertySettlement,
  ctx: { tenant: Tenant; propertyTitle: string },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const brand = ctx.tenant.brandConfig ?? {};
    const accent = brand.primaryColor && /^#?[0-9a-fA-F]{3,6}$/.test(brand.primaryColor)
      ? (brand.primaryColor.startsWith("#") ? brand.primaryColor : `#${brand.primaryColor}`)
      : "#1e293b";
    const onAccent = readableOn(accent);
    const headerTint = mix(accent, "#ffffff", 0.9); // fondo suave para la cabecera de la tabla

    // ---------- banda de cabecera (full-bleed) ----------
    const bandH = 92;
    doc.rect(0, 0, PAGE_W, bandH).fill(accent);
    doc.fillColor(onAccent).font("Helvetica-Bold").fontSize(21).text(ctx.tenant.name, LEFT, 26, {
      width: WIDTH - 160,
    });
    doc.font("Helvetica").fontSize(9).fillColor(onAccent);
    const contact = [ctx.tenant.siteConfig?.contactEmail, ctx.tenant.siteConfig?.contactPhone]
      .filter(Boolean)
      .join("   ·   ");
    if (contact) doc.text(contact, LEFT, 54, { width: WIDTH - 160 });
    // etiqueta a la derecha
    doc.font("Helvetica-Bold").fontSize(10).fillColor(onAccent).text("LIQUIDACIÓN DE GASTOS", RIGHT - 200, 34, {
      width: 200,
      align: "right",
      characterSpacing: 1,
    });

    // ---------- título del piso ----------
    let y = bandH + 26;
    doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(ctx.propertyTitle, LEFT, y);
    y = doc.y + 2;
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(
      `Reparto proporcional a los días de estancia · generado el ${fmtDay(new Date().toISOString().slice(0, 10))}`,
      LEFT,
      y,
    );
    y = doc.y + 18;

    const types = (Object.keys(settlement.totalsByType) as SharedExpenseType[]).sort((a, b) =>
      TYPE_LABEL[a].localeCompare(TYPE_LABEL[b], "es"),
    );

    // ---------- tabla de liquidación ----------
    const nameW = 138;
    const numCols = 1 + types.length + 1;
    const numW = (WIDTH - nameW) / numCols;
    const colX = (i: number) => LEFT + nameW + i * numW;
    const headers = ["Alquiler", ...types.map((t) => TYPE_LABEL[t]), "Total"];
    const rowH = 22;

    // cabecera con fondo tintado
    doc.rect(LEFT, y, WIDTH, rowH).fill(headerTint);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(8.5);
    doc.text("INQUILINO", LEFT + 8, y + 7, { width: nameW - 8, characterSpacing: 0.4 });
    headers.forEach((h, i) =>
      doc.text(h.toUpperCase(), colX(i), y + 7, { width: numW - 8, align: "right", characterSpacing: 0.4 }),
    );
    y += rowH;

    doc.font("Helvetica").fontSize(9.5);
    settlement.tenants.forEach((t, idx) => {
      if (idx % 2 === 1) doc.rect(LEFT, y, WIDTH, rowH).fill("#f8fafc");
      doc.fillColor(INK);
      const name = t.roomName ? `${t.renterName}` : t.renterName;
      doc.font("Helvetica-Bold").text(name, LEFT + 8, y + 6, { width: nameW - 8, lineBreak: false });
      if (t.roomName) {
        doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(t.roomName, LEFT + 8, y + 6 + 11, {
          width: nameW - 8,
          lineBreak: false,
        });
        doc.fontSize(9.5);
      }
      const vals = [t.monthlyRentCents, ...types.map((ty) => t.byType[ty] ?? 0), t.totalCents];
      vals.forEach((v, i) => {
        const isTotal = i === vals.length - 1;
        doc.font(isTotal ? "Helvetica-Bold" : "Helvetica").fillColor(isTotal ? accent : INK);
        doc.text(v ? eur(v) : "—", colX(i) - 8, y + 6, { width: numW - 8, align: "right" });
      });
      doc.fillColor(INK).font("Helvetica");
      y += rowH;
    });

    // fila de totales
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1).strokeColor(accent).stroke();
    doc.rect(LEFT, y, WIDTH, rowH).fill(headerTint);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(9.5).text("Total", LEFT + 8, y + 6, { width: nameW - 8 });
    const sumRent = settlement.tenants.reduce((a, t) => a + t.monthlyRentCents, 0);
    const sumTotal = settlement.tenants.reduce((a, t) => a + t.totalCents, 0);
    const totalRow = [sumRent, ...types.map((t) => settlement.totalsByType[t] ?? 0), sumTotal];
    totalRow.forEach((v, i) => {
      const isTotal = i === totalRow.length - 1;
      doc.fillColor(isTotal ? accent : INK);
      doc.text(eur(v), colX(i) - 8, y + 6, { width: numW - 8, align: "right" });
    });
    y += rowH + 26;

    // ---------- detalle de facturas ----------
    if (settlement.expenses.length > 0) {
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Facturas y reparto", LEFT, y);
      y = doc.y + 8;

      for (const e of settlement.expenses) {
        const blockH = 30 + e.shares.length * 15 + 12;
        if (y + blockH > 780) {
          doc.addPage();
          y = 50;
        }
        // punto de color por tipo + título
        doc.circle(LEFT + 4, y + 6, 4).fill(TYPE_COLOR[e.type]);
        doc.fillColor(INK).font("Helvetica-Bold").fontSize(10.5);
        const head = `${TYPE_LABEL[e.type]}${e.concept ? ` · ${e.concept}` : ""}`;
        doc.text(head, LEFT + 14, y, { width: 320, lineBreak: false });
        doc.font("Helvetica-Bold").fillColor(INK).text(eur(e.amountCents), colX(0) - 8, y, {
          width: RIGHT - colX(0),
          align: "right",
        });
        doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(
          `${fmtDay(e.periodStart)} – ${fmtDay(e.periodEnd)}`,
          LEFT + 14,
          y + 13,
        );
        y += 28;
        doc.fontSize(9).fillColor("#334155");
        for (const s of e.shares) {
          doc.font("Helvetica").text(`${s.renterName}`, LEFT + 20, y, { width: 180, lineBreak: false });
          doc.fillColor(MUTED).fontSize(8.5).text(`${s.days} días`, LEFT + 190, y + 1, { width: 60 });
          doc.fillColor("#334155").fontSize(9).font("Helvetica-Bold").text(eur(s.cents), colX(0) - 8, y, {
            width: RIGHT - colX(0),
            align: "right",
          });
          doc.font("Helvetica");
          y += 15;
        }
        // separador suave
        y += 4;
        doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor(LINE).stroke();
        y += 10;
      }
    }

    // ---------- pie ----------
    const footY = 812;
    doc.moveTo(LEFT, footY).lineTo(RIGHT, footY).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
      `${ctx.tenant.name} · Este reparto se calcula por los días que cada inquilino coincide con el periodo de cada factura.`,
      LEFT,
      footY + 6,
      { width: WIDTH, align: "center" },
    );

    doc.end();
  });
}
