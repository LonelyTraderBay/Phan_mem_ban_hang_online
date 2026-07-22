import type { ReactNode } from "react";
import type { AuthStatus } from "./authStateMachine";

interface RequireAuthProps {
  status: AuthStatus;
  children: ReactNode;
  fallback: ReactNode;
}

// Kept presentational and router-agnostic — apps (CP7) wire the actual redirect behavior
// using their router of choice; this only decides what to render.
export function RequireAuth({ status, children, fallback }: RequireAuthProps) {
  return <>{status === "authenticated" ? children : fallback}</>;
}

interface RequireTenantProps {
  tenantId: string | null;
  children: ReactNode;
  fallback: ReactNode;
}

export function RequireTenant({ tenantId, children, fallback }: RequireTenantProps) {
  return <>{tenantId ? children : fallback}</>;
}
