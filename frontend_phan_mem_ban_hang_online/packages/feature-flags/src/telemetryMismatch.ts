import type { TelemetryAdapter } from "@ai-sales/telemetry";

/**
 * FE-F00-007 step 5: tracks drift between the frontend's known flag keys and what the server
 * bootstrap payload actually sent, in either direction.
 */
export function reportFeatureFlagMismatch(
  telemetry: TelemetryAdapter,
  knownKeys: string[],
  serverKeys: string[],
): void {
  const missingFromServer = knownKeys.filter((key) => !serverKeys.includes(key));
  const unknownFromServer = serverKeys.filter((key) => !knownKeys.includes(key));
  if (missingFromServer.length === 0 && unknownFromServer.length === 0) return;
  telemetry.captureEvent("feature_flag_mismatch", { missingFromServer, unknownFromServer });
}
