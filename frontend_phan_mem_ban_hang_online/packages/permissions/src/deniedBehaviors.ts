import type { TelemetryAdapter } from "@ai-sales/telemetry";

export interface PermissionMismatch {
  permission: string;
  context?: Record<string, unknown>;
}

/**
 * Spec 10.4: if the server 403s despite the client believing a permission was granted (a stale
 * registry), this must never be a silent no-op — record telemetry so the mismatch is visible,
 * and the caller renders a forbidden state rather than pretending the action succeeded.
 */
export function reportPermissionMismatch(telemetry: TelemetryAdapter, mismatch: PermissionMismatch): void {
  telemetry.captureEvent("permission_mismatch", { permission: mismatch.permission, ...mismatch.context });
}
