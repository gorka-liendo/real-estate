import { clients, tenantDb, type Client } from "@rep/db";
import type { CreateLeadInput } from "./leads.schema.js";

// Un lead del micrositio es un cliente en etapa 'lead' con source 'microsite'.
// Vía tenantDb() → aislamiento por tenant garantizado por @rep/db.
export async function createLead(input: Omit<CreateLeadInput, "company">): Promise<Client> {
  const rows = (await tenantDb()
    .insert(clients, {
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      stage: "lead",
      source: "microsite",
      interestPropertyId: input.propertyId ?? null,
      notes: input.message?.trim() || null,
    })
    .returning()) as Client[];
  return rows[0]!;
}
