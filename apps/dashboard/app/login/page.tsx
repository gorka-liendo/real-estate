"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Input, Label } from "@rep/ui";
import { useAuth } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api";
import { routes } from "@/lib/routes";

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace(routes.home);
  }, [status, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace(routes.home);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Email o contraseña incorrectos."
          : "No se pudo iniciar sesión. Inténtalo de nuevo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: "var(--ui-sp-6)" }}>
          <div className="du-h1" style={{ fontWeight: 800 }}>
            Real Estate Platform
          </div>
          <p className="du-muted" style={{ marginTop: 4 }}>
            Panel de gestión
          </p>
        </div>

        <Card>
          <form onSubmit={onSubmit} style={{ display: "grid", gap: "var(--ui-sp-4)" }}>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error ? (
              <p role="alert" className="du-alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={submitting} style={{ width: "100%" }}>
              {submitting ? "Entrando…" : "Iniciar sesión"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
