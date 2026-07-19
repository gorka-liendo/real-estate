import type { ClientKind } from "./api";

// Labels de tipo de cliente — fuente única para lista y perfil.
export const KIND_LABELS: Record<ClientKind, string> = {
  owner: "Propietario",
  renter: "Inquilino",
  buyer: "Comprador",
  seeker: "Busca alquiler",
  other: "Sin clasificar",
};
