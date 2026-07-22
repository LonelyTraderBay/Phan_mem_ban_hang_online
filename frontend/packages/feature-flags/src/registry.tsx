import { createContext, useContext, type ReactNode } from "react";
import type { FeatureFlagKey } from "./generated/featureFlagKeys";

export interface FeatureFlagState {
  enabled: boolean;
  // Explicitly `| undefined` (not just `variant?:`) so this structurally matches the Zod-inferred
  // shape of session bootstrap's `feature_flags` map under `exactOptionalPropertyTypes` (spec 9.3).
  variant?: string | undefined;
}

const FeatureFlagsContext = createContext<Record<string, FeatureFlagState> | null>(null);

interface FeatureFlagsProviderProps {
  flags: Record<string, FeatureFlagState>;
  children: ReactNode;
}

// Flags are always server-bootstrapped (ADR-FE-017), never evaluated client-side from scratch.
export function FeatureFlagsProvider({ flags, children }: FeatureFlagsProviderProps) {
  return <FeatureFlagsContext.Provider value={flags}>{children}</FeatureFlagsContext.Provider>;
}

/**
 * If the server payload omits a flag the client's registry knows about, this falls back to
 * `{ enabled: false }` (default-off per ADR-FE-017) rather than assuming enabled.
 */
export function useFeatureFlag(key: FeatureFlagKey): FeatureFlagState {
  const flags = useContext(FeatureFlagsContext);
  return flags?.[key] ?? { enabled: false };
}
