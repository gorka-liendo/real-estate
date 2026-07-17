"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type Membership } from "@/lib/api";
import { useAuth } from "./auth-context";

const STORAGE_KEY = "rep.workspace.tenant";

type WorkspaceValue = {
  memberships: Membership[];
  selected: Membership | null;
  selectSlug: (slug: string) => void;
  activeModules: string[] | null; // null = cargando
  hasModule: (code: string) => boolean;
  isPlatformAdmin: boolean;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const memberships = useMemo(() => me?.memberships ?? [], [me]);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [activeModules, setActiveModules] = useState<string[] | null>(null);

  // elige tenant inicial: el guardado si sigue siendo válido, si no el primero
  useEffect(() => {
    if (memberships.length === 0) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const valid = memberships.find((m) => m.slug === stored);
    setSelectedSlug((prev) => prev ?? valid?.slug ?? memberships[0]!.slug);
  }, [memberships]);

  // carga módulos activos del tenant seleccionado
  useEffect(() => {
    if (!selectedSlug) return;
    let cancelled = false;
    setActiveModules(null);
    void api.tenantModules(selectedSlug).then((r) => {
      if (!cancelled) setActiveModules(r.modules);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  function selectSlug(slug: string) {
    setSelectedSlug(slug);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, slug);
  }

  const value: WorkspaceValue = {
    memberships,
    selected: memberships.find((m) => m.slug === selectedSlug) ?? null,
    selectSlug,
    activeModules,
    hasModule: (code) => (activeModules ?? []).includes(code),
    isPlatformAdmin: me?.isPlatformAdmin ?? false,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace debe usarse dentro de <WorkspaceProvider>");
  return ctx;
}
