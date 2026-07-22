"use client";

import { useEffect } from "react";
import { useWorkspace } from "@/contexts/workspace-context";

// El favicon del dashboard sigue a la inmobiliaria seleccionada (white-label):
// si tiene favicon propio, la pestaña del panel lo muestra; si no, el icono por
// defecto del navegador. Se hace en cliente porque el workspace se elige aquí.
const MIME: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  webp: "image/webp",
  ico: "image/x-icon",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export function DynamicFavicon() {
  const { brandConfig } = useWorkspace();
  const faviconUrl = brandConfig?.faviconUrl;

  useEffect(() => {
    // Quitamos el que hubiera puesto este componente y, si hay, ponemos uno nuevo
    // (recrear el <link> fuerza al navegador a releer el icono).
    document.head.querySelectorAll("link[data-dynamic-favicon]").forEach((n) => n.remove());
    if (!faviconUrl) return;
    const link = document.createElement("link");
    link.rel = "icon";
    link.setAttribute("data-dynamic-favicon", "");
    link.href = faviconUrl;
    const ext = faviconUrl.split(".").pop()?.toLowerCase() ?? "";
    if (MIME[ext]) link.type = MIME[ext];
    document.head.appendChild(link);
  }, [faviconUrl]);

  return null;
}
