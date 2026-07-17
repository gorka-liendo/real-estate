"use client";

import {
  Building2,
  Globe,
  LayoutDashboard,
  LogOut,
  Shield,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Select } from "@rep/ui";
import { useAuth } from "@/contexts/auth-context";
import { useWorkspace } from "@/contexts/workspace-context";
import { routes } from "@/lib/routes";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  module?: string; // gatea por feature flag del tenant
  adminOnly?: boolean; // solo superadmin de plataforma
};

const NAV: NavItem[] = [
  { label: "Inicio", href: routes.home, icon: LayoutDashboard },
  { label: "Micrositio", href: routes.microsite, icon: Globe, module: "microsite" },
  { label: "Administración", href: routes.admin, icon: Shield, adminOnly: true },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const { memberships, selected, selectSlug, hasModule, isPlatformAdmin } = useWorkspace();
  const pathname = usePathname();

  const visible = NAV.filter((item) => {
    if (item.adminOnly) return isPlatformAdmin;
    if (item.module) return hasModule(item.module);
    return true;
  });

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand">Real Estate</div>
        <nav className="dash-nav">
          {visible.map((item) => {
            const active = item.href === routes.home
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="dash-nav__item"
                data-active={active}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
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
          <span className="du-muted" style={{ fontSize: 13 }}>
            Panel de gestión
          </span>
          {memberships.length > 0 ? (
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Building2 size={15} color="var(--ui-muted)" />
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
            </label>
          ) : null}
        </header>
        <div className="dash-content">{children}</div>
      </div>
    </div>
  );
}
