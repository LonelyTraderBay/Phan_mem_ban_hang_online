import type { ReactNode } from "react";

export interface FeatureFlagGateProps {
  /** Computed upstream by `useFeatureFlag()` from @ai-sales/feature-flags — same prop-driven
   * pattern as PermissionGate. */
  enabled: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureFlagGate({ enabled, children, fallback = null }: FeatureFlagGateProps) {
  return <>{enabled ? children : fallback}</>;
}
