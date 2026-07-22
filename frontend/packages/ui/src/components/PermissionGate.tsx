import type { ReactNode } from "react";

export interface PermissionGateProps {
  /** Computed upstream by `usePermission()` from @ai-sales/permissions and passed as a prop —
   * this component stays presentational and never imports @ai-sales/auth/permissions itself
   * (spec 4.3's ui boundary rule), even though PermissionGate is listed in spec 7.2's ui
   * component catalog. See packages/permissions/README and packages/ui/README for the pattern. */
  allowed: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({ allowed, children, fallback = null }: PermissionGateProps) {
  return <>{allowed ? children : fallback}</>;
}
