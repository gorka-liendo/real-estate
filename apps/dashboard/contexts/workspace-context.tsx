"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { BrandConfig } from "@rep/ui";
import { api, type Membership } from "@/lib/api";
import { routes } from "@/lib/routes";
import { useAuth } from "./auth-context";

const STORAGE_KEY = "rep.workspace.tenant";
const MODE_KEY = "rep.workspace.mode";

export type ColorMode = "light" | "dark";

type WorkspaceValue = {
  memberships: Membership[];
  selected: Membership | null;
  selectSlug: (slug: string) => void;
  brandConfig: BrandConfig | null;
  setBrandConfig: (b: BrandConfig) => void; // re-tiñe el dashboard al instante
  activeModules: string[] | null; // null = cargando
  hasModule: (code: string) => boolean;
  isPlatformAdmin: boolean;
  mode: ColorMode;
  setMode: (m: ColorMode) => void; // persiste en localStorage, independiente del tenant
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const memberships = useMemo(() => me?.memberships ?? [], [me]);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [activeModules, setActiveModules] = useState<string[] | null>(null);
  const [brandConfig, setBrandConfig] = useState<BrandConfig | null>(null);
  const [mode, setModeState] = useState<ColorMode>("light");

  useEffect(() => {
    if (memberships.length === 0) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const valid = memberships.find((m) => m.slug === stored);
    setSelectedSlug((prev) => prev ?? valid?.slug ?? memberships[0]!.slug);
  }, [memberships]);

  // Preferencia de modo: la elección explícita del usuario (localStorage) manda;
  // sin elección previa, respeta prefers-color-scheme del sistema.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "light" || stored === "dark") {
      setModeState(stored);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setModeState("dark");
    }
  }, []);

  // carga módulos activos + branding del tenant seleccionado
  useEffect(() => {
    if (!selectedSlug) return;
    let cancelled = false;
    setActiveModules(null);
    void api.tenantModules(selectedSlug).then((r) => {
      if (!cancelled) setActiveModules(r.modules);
    });
    void api.tenant(selectedSlug).then((t) => {
      if (!cancelled) setBrandConfig(t.brandConfig);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  function selectSlug(slug: string) {
    setSelectedSlug(slug);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, slug);
  }

  function setMode(next: ColorMode) {
    setModeState(next);
    if (typeof window !== "undefined") localStorage.setItem(MODE_KEY, next);
  }

  const value: WorkspaceValue = {
    memberships,
    selected: memberships.find((m) => m.slug === selectedSlug) ?? null,
    selectSlug,
    brandConfig,
    setBrandConfig,
    activeModules,
    hasModule: (code) => (activeModules ?? []).includes(code),
    isPlatformAdmin: me?.isPlatformAdmin ?? false,
    mode,
    setMode,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace debe usarse dentro de <WorkspaceProvider>");
  return ctx;
}

/**
 * Protege una página de módulo: si el tenant no lo tiene contratado, vuelve a
 * Inicio. Devuelve `true` mientras aún carga (para mostrar un placeholder).
 */
export function useRequireModule(code: string): boolean {
  const { activeModules, hasModule } = useWorkspace();
  const router = useRouter();
  useEffect(() => {
    if (activeModules !== null && !hasModule(code)) router.replace(routes.home);
  }, [activeModules, code, hasModule, router]);
  return activeModules === null;
}
