"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Crumb } from "@/components/breadcrumbs";

// Las migas viven en el header del shell (barra superior), pero cada página de
// detalle necesita fijar el nombre real de su entidad (título del inmueble,
// nombre del cliente…). Este contexto es el puente: la página registra su ruta
// y el shell la pinta. Los listados no registran nada → el shell deriva el nivel
// de sección desde la URL.

type Ctx = { items: Crumb[] | null; setItems: (items: Crumb[] | null) => void };
const BreadcrumbsContext = createContext<Ctx | null>(null);

export function BreadcrumbsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Crumb[] | null>(null);
  const value = useMemo(() => ({ items, setItems }), [items]);
  return <BreadcrumbsContext.Provider value={value}>{children}</BreadcrumbsContext.Provider>;
}

/** Devuelve las migas registradas por la página actual (o null si es un listado). */
export function useBreadcrumbs(): Crumb[] | null {
  return useContext(BreadcrumbsContext)?.items ?? null;
}

/**
 * Registra la ruta de la página actual en el header. Llamar SIEMPRE (antes de
 * cualquier return temprano); pasar `null` mientras cargan los datos deja que el
 * shell muestre el nivel de sección derivado de la URL.
 */
export function useSetBreadcrumbs(items: Crumb[] | null): void {
  const ctx = useContext(BreadcrumbsContext);
  const key = items ? JSON.stringify(items) : null;
  useEffect(() => {
    ctx?.setItems(items);
    return () => ctx?.setItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
