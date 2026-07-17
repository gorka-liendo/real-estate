import { eq } from "drizzle-orm";
import { clients, tenantDb, type Client } from "@rep/db";
import type { CreateClientInput, UpdateClientInput } from "./clients.schema.js";

// Lógica de negocio de clientes. SIEMPRE vía tenantDb() → aislamiento por tenant
// garantizado por el scoping de @rep/db (imposible ver/tocar clientes de otro tenant).
// Los `.returning()` del helper scoped devuelven filas sin tipar → cast a Client.

export async function listClients(): Promise<Client[]> {
  const rows = await tenantDb().select(clients);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function createClient(input: CreateClientInput): Promise<Client> {
  const rows = (await tenantDb().insert(clients, input).returning()) as Client[];
  return rows[0]!;
}

export async function updateClient(
  id: string,
  input: UpdateClientInput,
): Promise<Client | null> {
  const rows = (await tenantDb()
    .update(clients, input, eq(clients.id, id))
    .returning()) as Client[];
  return rows[0] ?? null;
}

export async function deleteClient(id: string): Promise<boolean> {
  const rows = (await tenantDb().delete(clients, eq(clients.id, id)).returning()) as Client[];
  return rows.length > 0;
}
