"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/contexts/auth-context";
import { routes } from "@/lib/routes";

/** Envuelve páginas privadas: redirige a /login si no hay sesión. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace(routes.login);
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div
        className="du-muted"
        style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontSize: 14 }}
      >
        Cargando…
      </div>
    );
  }
  return <>{children}</>;
}
