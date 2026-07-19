import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  clients,
  properties,
  tenantDb,
  visits,
  type Client,
  type Property,
  type Visit,
} from "@rep/db";

// Portal del propietario: el token es la credencial (capability URL) que la
// agencia genera y comparte. Todo va por tenantDb → un token solo funciona
// bajo el dominio/slug de SU inmobiliaria.

export async function getOrCreatePortalToken(clientId: string): Promise<string | null> {
  const rows = (await tenantDb().select(clients, eq(clients.id, clientId))) as Client[];
  const client = rows[0];
  if (!client) return null;
  if (client.portalToken) return client.portalToken;

  const token = randomUUID();
  await tenantDb().update(clients, { portalToken: token }, eq(clients.id, clientId));
  return token;
}

// Lo que el propietario ve de cada inmueble suyo. Las visitas van SIN datos
// personales del visitante (solo fecha y estado) — no son asunto del dueño.
export type PortalProperty = {
  id: string;
  title: string;
  status: Property["status"];
  operation: Property["operation"];
  price: number | null;
  city: string | null;
  photo: string | null;
  upcomingVisits: Array<{ at: string; status: Visit["status"] }>;
  visitsDone: number;
  interested: number;
};

export type PortalData = {
  owner: { name: string };
  properties: PortalProperty[];
};

export async function getPortalData(token: string): Promise<PortalData | null> {
  const owners = (await tenantDb().select(clients, eq(clients.portalToken, token))) as Client[];
  const owner = owners[0];
  if (!owner) return null;

  const owned = (await tenantDb().select(
    properties,
    eq(properties.ownerClientId, owner.id),
  )) as Property[];
  if (owned.length === 0) return { owner: { name: owner.name }, properties: [] };

  const ids = owned.map((p) => p.id);
  const [allVisits, interestedClients] = await Promise.all([
    tenantDb().select(visits, inArray(visits.propertyId, ids)) as Promise<Visit[]>,
    tenantDb().select(clients, inArray(clients.interestPropertyId, ids)) as Promise<Client[]>,
  ]);

  const now = Date.now();
  return {
    owner: { name: owner.name },
    properties: owned.map((p) => {
      const vs = allVisits.filter((v) => v.propertyId === p.id);
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        operation: p.operation,
        price: p.price,
        city: p.city,
        photo: p.photos[0] ?? null,
        upcomingVisits: vs
          .filter(
            (v) =>
              v.scheduledAt.getTime() >= now &&
              (v.status === "requested" || v.status === "confirmed"),
          )
          .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
          .map((v) => ({ at: v.scheduledAt.toISOString(), status: v.status })),
        visitsDone: vs.filter((v) => v.status === "done").length,
        interested: interestedClients.filter((cl) => cl.interestPropertyId === p.id).length,
      };
    }),
  };
}
