"use client";

import { LeadForm, type LeadFormData } from "@rep/ui-tenant";
import { submitLead } from "@/lib/tenant";

// Wrapper cliente: posee el fetch al API (POST /tenant/leads) y deja el LeadForm
// del DS puramente presentacional. Inyecta el inmueble de interés si aplica.
export function ContactForm({
  slug,
  propertyId,
  title,
  submitLabel,
}: {
  slug: string;
  propertyId?: string;
  title?: string;
  submitLabel?: string;
}) {
  async function handleSubmit(data: LeadFormData) {
    await submitLead(slug, {
      name: data.name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      message: data.message || undefined,
      propertyId,
      company: data.company || undefined,
    });
  }

  return <LeadForm onSubmit={handleSubmit} title={title} submitLabel={submitLabel} />;
}
