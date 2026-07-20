"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, type Client, type Invoice, type Property } from "@/lib/api";
import { AccountDetail } from "../../_shared";

function Inner({ slug, propertyId }: { slug: string; propertyId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Invoice[]>([]);
  const [property, setProperty] = useState<Property | null>(null);
  const [propsList, setPropsList] = useState<Property[]>([]);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [invoicesRes, propsRes] = await Promise.all([
        api.invoices.list(slug, { propertyId }),
        api.properties.list(slug),
      ]);
      const found = propsRes.properties.find((p) => p.id === propertyId);
      if (!found) {
        router.replace("/contabilidad");
        return;
      }
      setItems(invoicesRes.invoices);
      setPropsList(propsRes.properties);
      setProperty(found);
      setLoaded(true);
    } catch {
      setError("No se pudo cargar el inmueble.");
    }
  }, [slug, propertyId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.clients.list(slug).then((r) => setClientsList(r.clients)).catch(() => {});
  }, [slug]);

  if (!loaded || !property) {
    return error ? <p className="du-alert">{error}</p> : <p className="du-muted">Cargando…</p>;
  }

  return (
    <AccountDetail
      slug={slug}
      kind="property"
      id={propertyId}
      name={property.title}
      items={items}
      setItems={setItems}
      propsList={propsList}
      clientsList={clientsList}
    />
  );
}

export default function PropertyAccountPage() {
  const params = useParams<{ id: string }>();
  const { selected } = useWorkspace();
  const loading = useRequireModule("accounting");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <Inner slug={selected.slug} propertyId={params.id} />;
}
