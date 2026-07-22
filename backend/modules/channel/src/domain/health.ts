/**
 * BE-CHN-010 — Token/scope/health monitoring stubs (blueprint §10.6).
 */

export type AccountHealth = "ok" | "warn" | "error" | null;
export type AccountStatus = "connecting" | "active" | "degraded" | "disconnected" | "revoked";

export interface HealthSignals {
  readonly tokenExpiresAt: string | null;
  readonly grantedScopes: readonly string[];
  readonly requiredScopes: readonly string[];
  readonly webhookLagSeconds: number | null;
  readonly sendFailureRatio: number | null;
  readonly providerOutage: boolean;
}

export function computeAccountHealth(signals: HealthSignals): AccountHealth {
  if (signals.providerOutage) return "error";
  if (signals.tokenExpiresAt) {
    const msLeft = new Date(signals.tokenExpiresAt).getTime() - Date.now();
    if (msLeft <= 0) return "error";
    if (msLeft < 24 * 60 * 60 * 1000) return "warn";
  }
  const missing = signals.requiredScopes.filter((s) => !signals.grantedScopes.includes(s));
  if (missing.length > 0) return "warn";
  if ((signals.sendFailureRatio ?? 0) > 0.25) return "warn";
  if ((signals.webhookLagSeconds ?? 0) > 300) return "warn";
  return "ok";
}

export function deriveAccountStatus(args: {
  readonly health: AccountHealth;
  readonly lifecycle: "connected" | "connecting" | "disconnected" | "revoked";
}): AccountStatus {
  if (args.lifecycle === "revoked") return "revoked";
  if (args.lifecycle === "disconnected") return "disconnected";
  if (args.lifecycle === "connecting") return "connecting";
  if (args.health === "error") return "degraded";
  if (args.health === "warn") return "degraded";
  return "active";
}

export function missingScopes(
  granted: readonly string[],
  required: readonly string[]
): readonly string[] {
  return required.filter((scope) => !granted.includes(scope));
}
