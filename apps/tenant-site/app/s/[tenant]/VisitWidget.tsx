"use client";

import { VisitForm, type VisitFormData } from "@rep/ui-tenant";
import { submitVisitRequest } from "@/lib/tenant";

// Wrapper cliente del "Pedir visita": posee el fetch y compone la fecha ISO
// a partir de día + franja (mismo patrón que ContactForm/ValuationWidget).
export function VisitWidget({ slug, propertyId }: { slug: string; propertyId: string }) {
  async function handleSubmit(data: VisitFormData) {
    if (!data.date || !data.time) throw new Error("missing_datetime");
    await submitVisitRequest(slug, {
      propertyId,
      name: data.name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      scheduledAt: new Date(`${data.date}T${data.time}:00`).toISOString(),
      company: data.company || undefined,
    });
  }

  return <VisitForm onSubmit={handleSubmit} />;
}
