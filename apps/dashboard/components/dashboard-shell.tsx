"use client";

import { House, LogOut, Moon, Settings, Shield, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Select } from "@rep/ui";
import { Breadcrumbs, type Crumb } from "@/components/breadcrumbs";
import { useAuth } from "@/contexts/auth-context";
import { useBreadcrumbs } from "@/contexts/breadcrumbs-context";
import { useWorkspace } from "@/contexts/workspace-context";
import { MODULE_SECTIONS } from "@/lib/modules";
import { routes } from "@/lib/routes";

export function DashboardShell({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const { memberships, selected, selectSlug, brandConfig, hasModule, isPlatformAdmin, mode, setMode } =
    useWorkspace();
  const pathname = usePathname();

  // el design system del dashboard = el TEMA de la inmobiliaria (data-theme).
  const theme = brandConfig?.theme ?? "dwell";
  const logoUrl = brandConfig?.logoUrl;

  const isActive = (href: string) =>
    href === routes.home ? pathname === href : pathname.startsWith(href);

  const sections = MODULE_SECTIONS.filter((s) => hasModule(s.code));

  // Migas: las que registre la página de detalle, o el nivel de sección derivado
  // de la URL para los listados (Inicio se antepone dentro de <Breadcrumbs>).
  const pageCrumbs = useBreadcrumbs();
  const crumbs: Crumb[] = pageCrumbs ?? deriveSectionCrumb(pathname);

  // Superadmin PURO (sin membership de ningún tenant): Inicio (rejilla de
  // módulos de un tenant) y Ajustes (marca/logo de un tenant) no significan
  // nada para él — su "inicio" es Administración.
  const platformOnly = isPlatformAdmin && memberships.length === 0;

  return (
    <div className="dash-shell" data-theme={theme} data-mode={mode}>
      <aside className="dash-sidebar">
        <div className="dash-brand">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={selected?.name ?? ""} style={{ maxHeight: 28 }} />
          ) : (
            (selected?.name ?? "Real Estate")
          )}
        </div>

        <nav className="dash-nav">
          {!platformOnly ? (
            <Link href={routes.home} className="dash-nav__item" data-active={isActive(routes.home)}>
              <House size={16} />
              Inicio
            </Link>
          ) : null}

          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.href} href={s.href} className="dash-nav__item" data-active={isActive(s.href)}>
                <Icon size={16} />
                {s.label}
              </Link>
            );
          })}

          {!platformOnly ? (
            <Link href={routes.ajustes} className="dash-nav__item" data-active={isActive(routes.ajustes)}>
              <Settings size={16} />
              Ajustes
            </Link>
          ) : null}

          {isPlatformAdmin ? (
            <Link href={routes.admin} className="dash-nav__item" data-active={isActive(routes.admin)}>
              <Shield size={16} />
              Administración
            </Link>
          ) : null}
        </nav>

        <div className="dash-sidebar__foot">
          <button
            className="du-btn du-btn--ghost du-btn--sm"
            style={{ width: "100%", justifyContent: "flex-start", marginBottom: "var(--ui-sp-2)" }}
            onClick={() => setMode(mode === "dark" ? "light" : "dark")}
            aria-label={mode === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {mode === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            {mode === "dark" ? "Modo claro" : "Modo oscuro"}
          </button>
          <div className="dash-user">{me?.user.email}</div>
          <button className="du-btn du-btn--ghost du-btn--sm" onClick={() => void logout()}>
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-header">
          <Breadcrumbs items={crumbs} />
          {memberships.length > 1 ? (
            <Select
              value={selected?.slug ?? ""}
              onChange={(e) => selectSlug(e.target.value)}
              style={{ width: "auto", minWidth: 200 }}
              aria-label="Inmobiliaria"
            >
              {memberships.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </Select>
          ) : null}
        </header>
        <div className="dash-content">{children}</div>
      </div>
    </div>
  );
}

// Nivel de sección para los listados (los detalles registran su propia ruta).
// "Inicio" lo antepone <Breadcrumbs>, así que en la home devolvemos [].
function deriveSectionCrumb(pathname: string): Crumb[] {
  if (pathname === routes.home) return [];
  const tops: Array<{ label: string; href: string }> = [
    ...MODULE_SECTIONS.map((s) => ({ label: s.label, href: s.href })),
    { label: "Ajustes", href: routes.ajustes },
    { label: "Administración", href: routes.admin },
  ];
  const match =
    tops.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`)) ??
    tops.find((s) => s.href !== "/" && pathname.startsWith(s.href));
  return match ? [{ label: match.label }] : [];
}
