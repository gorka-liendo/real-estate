"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, type Client, type Invoice, type Property } from "@/lib/api";
import { AccountDetail } from "../../_shared";

function Inner({ slug, clientId }: { slug: string; clientId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Invoice[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [propsList, setPropsList] = useState<Property[]>([]);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [invoicesRes, clientsRes] = await Promise.all([
        api.invoices.list(slug, { clientId }),
        api.clients.list(slug),
      ]);
      const found = clientsRes.clients.find((c) => c.id === clientId);
      if (!found) {
        router.replace("/contabilidad");
        return;
      }
      setItems(invoicesRes.invoices);
      setClientsList(clientsRes.clients);
      setClient(found);
      setLoaded(true);
    } catch {
      setError("No se pudo cargar el cliente.");
    }
  }, [slug, clientId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.properties.list(slug).then((r) => setPropsList(r.properties)).catch(() => {});
  }, [slug]);

  if (!loaded || !client) {
    return error ? <p className="du-alert">{error}</p> : <p className="du-muted">Cargando…</p>;
  }

  return (
    <AccountDetail
      slug={slug}
      kind="client"
      id={clientId}
      name={client.name}
      items={items}
      setItems={setItems}
      propsList={propsList}
      clientsList={clientsList}
    />
  );
}

export default function ClientAccountPage() {
  const params = useParams<{ id: string }>();
  const { selected } = useWorkspace();
  const loading = useRequireModule("accounting");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <Inner slug={selected.slug} clientId={params.id} />;
}
