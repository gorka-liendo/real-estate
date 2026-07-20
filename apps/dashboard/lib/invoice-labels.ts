import type { InvoiceCategory } from "./api";

// Labels de categoría de factura — fuente única (Alquileres y Contabilidad
// consumen esta misma tabla, igual que client-labels.ts para clientes).
export const INVOICE_CATEGORY_LABELS: Record<InvoiceCategory, string> = {
  water: "Agua",
  electricity: "Luz",
  gas: "Gas",
  community: "Comunidad",
  taxes: "Impuestos",
  derrama: "Derrama",
  maintenance: "Mantenimiento",
  insurance: "Seguro",
  management_fee: "Honorarios de gestión",
  commission: "Comisión",
  other: "Otros",
};
