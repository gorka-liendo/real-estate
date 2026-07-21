"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/contexts/workspace-context";
import { api, type AdminTenant } from "@/lib/api";
import { routes } from "@/lib/routes";
import { Editor } from "@/app/(app)/micrositio/page";

// Editor del micrositio de UNA inmobiliaria, operado por el SUPERADMIN.
// Reusa el mismo <Editor> del owner pero con la fuente de datos admin
// (api.adminSite → /admin/tenants/:slug/*) y los módulos del propio tenant.
export default function AdminTenantMicrositePage() {
  const { isPlatformAdmin } = useWorkspace();
  const router = useRouter();
  const params = useParams();
  const slug = String(params.slug);
  const [tenant, setTenant] = useState<AdminTenant | null | undefined>(undefined);

  useEffect(() => {
    if (!isPlatformAdmin) router.replace(routes.home);
  }, [isPlatformAdmin, router]);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    api
      .adminTenants()
      .then((r) => setTenant(r.tenants.find((t) => t.slug === slug) ?? null))
      .catch(() => setTenant(null));
  }, [isPlatformAdmin, slug]);

  if (!isPlatformAdmin) return null;
  if (tenant === undefined) return <p className="du-muted">Cargando…</p>;
  if (tenant === null) return <p className="du-alert">No se encontró la inmobiliaria.</p>;

  return (
    <Editor
      slug={tenant.slug}
      name={tenant.name}
      source={api.adminSite}
      hasModule={(code) => tenant.activeModules.includes(code)}
      backHref={routes.admin}
    />
  );
}
