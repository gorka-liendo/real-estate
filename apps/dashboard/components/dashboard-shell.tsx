"use client";

import { Building2, LayoutDashboard, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Select } from "@rep/ui";
import { useAuth } from "@/contexts/auth-context";
import type { Membership } from "@/lib/api";

type NavItem = { label: string; icon: ReactNode; active?: boolean };

const nav: NavItem[] = [
  { label: "Inicio", icon: <LayoutDashboard size={16} />, active: true },
];

export function DashboardShell({
  title,
  memberships,
  selectedSlug,
  onSelectTenant,
  children,
}: {
  title: string;
  memberships: Membership[];
  selectedSlug: string | null;
  onSelectTenant: (slug: string) => void;
  children: ReactNode;
}) {
  const { me, logout } = useAuth();

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand">Real Estate</div>
        <nav className="dash-nav">
          {nav.map((item) => (
            <span key={item.label} className="dash-nav__item" data-active={item.active}>
              {item.icon}
              {item.label}
            </span>
          ))}
        </nav>
        <div className="dash-sidebar__foot">
          <div className="dash-user">{me?.user.email}</div>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut size={15} />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-header">
          <h1 className="du-h1">{title}</h1>
          {memberships.length > 0 ? (
            <label className="du-muted" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <Building2 size={15} />
              <Select
                value={selectedSlug ?? ""}
                onChange={(e) => onSelectTenant(e.target.value)}
                style={{ width: "auto", minWidth: 200 }}
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
