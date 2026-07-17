"use client";

import { House, LogOut, Settings, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { brandConfigToUiVars, Select } from "@rep/ui";
import { useAuth } from "@/contexts/auth-context";
import { useWorkspace } from "@/contexts/workspace-context";
import { MODULE_SECTIONS } from "@/lib/modules";
import { routes } from "@/lib/routes";

export function DashboardShell({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const { memberships, selected, selectSlug, brandConfig, hasModule, isPlatformAdmin } =
    useWorkspace();
  const pathname = usePathname();

  // white-label total: la marca de la inmobiliaria tiñe todo el dashboard
  const brandVars = brandConfigToUiVars(brandConfig);
  const logoUrl = brandConfig?.logoUrl;

  const isActive = (href: string) =>
    href === routes.home ? pathname === href : pathname.startsWith(href);

  const sections = MODULE_SECTIONS.filter((s) => hasModule(s.code));

  return (
    <div className="dash-shell" style={brandVars}>
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
          <Link href={routes.home} className="dash-nav__item" data-active={isActive(routes.home)}>
            <House size={16} />
            Inicio
          </Link>

          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.href} href={s.href} className="dash-nav__item" data-active={isActive(s.href)}>
                <Icon size={16} />
                {s.label}
              </Link>
            );
          })}

          <Link href={routes.ajustes} className="dash-nav__item" data-active={isActive(routes.ajustes)}>
            <Settings size={16} />
            Ajustes
          </Link>

          {isPlatformAdmin ? (
            <Link href={routes.admin} className="dash-nav__item" data-active={isActive(routes.admin)}>
              <Shield size={16} />
              Administración
            </Link>
          ) : null}
        </nav>

        <div className="dash-sidebar__foot">
          <div className="dash-user">{me?.user.email}</div>
          <button className="du-btn du-btn--ghost du-btn--sm" onClick={() => void logout()}>
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-header">
          <span />
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
