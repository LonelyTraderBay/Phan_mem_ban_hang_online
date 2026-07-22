/**
 * BE-DSK-001…005 — Desktop client contract stubs (delegates to identity/fulfillment where frozen).
 */

export const DESKTOP_MIN_CLIENT_VERSION = "1.0.0";

export interface DesktopDevicePolicy {
  readonly minClientVersion: string;
  readonly allowedPlatforms: readonly string[];
  readonly revokeOnVersionMismatch: boolean;
}

export const DEFAULT_DEVICE_POLICY: DesktopDevicePolicy = {
  minClientVersion: DESKTOP_MIN_CLIENT_VERSION,
  allowedPlatforms: ["windows"],
  revokeOnVersionMismatch: false
};

export function evaluateClientVersion(clientVersion: string | null | undefined): {
  readonly allowed: boolean;
  readonly reason: string | null;
} {
  if (!clientVersion?.trim()) {
    return { allowed: false, reason: "client_version_required" };
  }
  const [major] = clientVersion.split(".");
  const [minMajor] = DESKTOP_MIN_CLIENT_VERSION.split(".");
  if (Number(major) < Number(minMajor)) {
    return { allowed: false, reason: "client_version_too_old" };
  }
  return { allowed: true, reason: null };
}

export interface DesktopNotificationContract {
  readonly channel: "sse";
  readonly eventTypes: readonly string[];
  readonly reconnectPolicy: { readonly maxBackoffMs: number; readonly jitter: boolean };
}

export const WINDOWS_NOTIFICATION_CONTRACT: DesktopNotificationContract = {
  channel: "sse",
  eventTypes: ["conversation.updated", "order.updated", "billing.usage_recorded", "device.revoked"],
  reconnectPolicy: { maxBackoffMs: 30_000, jitter: true }
};

export interface PackingSlipPayload {
  readonly orderId: string;
  readonly signedAssetUrl: string;
  readonly expiresAt: string;
}

export function buildPackingSlipPayload(orderId: string): PackingSlipPayload {
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  return {
    orderId,
    signedAssetUrl: `https://assets.local/packing/${orderId}?sig=stub&exp=${encodeURIComponent(expiresAt)}`,
    expiresAt
  };
}

export interface OfflineDraftRevalidationResult {
  readonly accepted: boolean;
  readonly serverVersion: number;
  readonly conflicts: readonly string[];
}

export function revalidateOfflineDraft(options: {
  readonly clientVersion: number;
  readonly serverVersion: number;
  readonly payloadHash: string;
  readonly serverPayloadHash: string;
}): OfflineDraftRevalidationResult {
  const conflicts: string[] = [];
  if (options.clientVersion < options.serverVersion) {
    conflicts.push("server_ahead");
  }
  if (options.payloadHash !== options.serverPayloadHash) {
    conflicts.push("payload_mismatch");
  }
  return {
    accepted: conflicts.length === 0,
    serverVersion: options.serverVersion,
    conflicts
  };
}

export interface CrashTelemetryEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly deviceId: string;
  readonly clientVersion: string;
  readonly crashSignature: string;
  readonly occurredAt: string;
}

export function ingestCrashTelemetry(options: {
  readonly tenantId: string;
  readonly deviceId: string;
  readonly clientVersion: string;
  readonly crashSignature: string;
}): CrashTelemetryEvent {
  return {
    id: crypto.randomUUID(),
    tenantId: options.tenantId,
    deviceId: options.deviceId,
    clientVersion: options.clientVersion,
    crashSignature: options.crashSignature.slice(0, 256),
    occurredAt: new Date().toISOString()
  };
}
