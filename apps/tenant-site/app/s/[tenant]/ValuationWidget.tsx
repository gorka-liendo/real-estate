"use client";

import {
  ValuationForm,
  type ValuationEstimate,
  type ValuationFormData,
} from "@rep/ui-tenant";
import { submitValuation } from "@/lib/tenant";

// Wrapper cliente del widget "Valora tu piso gratis": posee el fetch al API y
// deja el ValuationForm del DS presentacional (mismo patrón que ContactForm).
export function ValuationWidget({ slug }: { slug: string }) {
  async function handleSubmit(data: ValuationFormData): Promise<ValuationEstimate | null> {
    return await submitValuation(slug, {
      name: data.name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      kind: data.kind,
      areaM2: Number(data.areaM2),
      city: data.city || undefined,
      bedrooms: data.bedrooms ? Number(data.bedrooms) : undefined,
      company: data.company || undefined,
    });
  }

  return <ValuationForm onSubmit={handleSubmit} />;
}
