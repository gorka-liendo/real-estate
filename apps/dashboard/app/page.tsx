"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";

function Topbar() {
  const { me, logout } = useAuth();
  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
      <span className="text-sm font-semibold tracking-tight">Real Estate Platform</span>
      <div className="flex items-center gap-4">
        <span className="text-sm text-neutral-500">{me?.user.email}</span>
        <button
          onClick={() => void logout()}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          Salir
        </button>
      </div>
    </header>
  );
}

function Home() {
  const { me } = useAuth();
  const memberships = me?.memberships ?? [];
  const [selected, setSelected] = useState<string | null>(memberships[0]?.slug ?? null);
  const [modules, setModules] = useState<string[] | null>(null);

  useEffect(() => {
    if (!selected) return;
    setModules(null);
    void api.tenantModules(selected).then((r) => setModules(r.modules));
  }, [selected]);

  const current = memberships.find((m) => m.slug === selected);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Hola, {me?.user.name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {memberships.length === 0
          ? "Todavía no perteneces a ninguna inmobiliaria."
          : "Selecciona una inmobiliaria para gestionarla."}
      </p>

      {memberships.length > 0 ? (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-3">
            <label htmlFor="tenant" className="text-sm font-medium text-neutral-700">
              Inmobiliaria
            </label>
            <select
              id="tenant"
              value={selected ?? ""}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-900"
            >
              {memberships.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </select>
            {current ? (
              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                {current.role}
              </span>
            ) : null}
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-medium text-neutral-700">Módulos activos</h2>
            {modules === null ? (
              <p className="mt-2 text-sm text-neutral-400">Cargando…</p>
            ) : modules.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-400">
                Sin módulos contratados. Contáctanos para activarlos.
              </p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {modules.map((code) => (
                  <li
                    key={code}
                    className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700"
                  >
                    {code}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function DashboardHome() {
  return (
    <RequireAuth>
      <Topbar />
      <Home />
    </RequireAuth>
  );
}
