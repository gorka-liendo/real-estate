import type { ReactNode } from "react";
import { RequireAuth } from "@/components/require-auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { WorkspaceProvider } from "@/contexts/workspace-context";

// Layout de todas las páginas autenticadas: guard + workspace + shell compartido.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <WorkspaceProvider>
        <DashboardShell>{children}</DashboardShell>
      </WorkspaceProvider>
    </RequireAuth>
  );
}
