import { generateUuidV7 } from "@ai-sales/domain-kernel";
import {
  assertCsrfDoubleSubmit,
  OidcAuthError,
  sha256Hex,
  type SessionAuthRepository
} from "./oidc-types.js";

/** Clear current BFF session (cookie hash) and revoke refresh family. */
export async function logoutSession(options: {
  readonly sessions: SessionAuthRepository;
  readonly presentedRefreshToken: string | undefined;
  readonly csrfCookie: string | undefined;
  readonly csrfHeader: string | undefined;
  readonly correlationId?: string | null;
}): Promise<{ readonly cleared: true }> {
  assertCsrfDoubleSubmit(options.csrfCookie, options.csrfHeader);
  const presented = options.presentedRefreshToken?.trim();
  if (!presented) {
    throw new OidcAuthError("Session required.", "AUTH_UNAUTHORIZED");
  }

  const outcome = await options.sessions.logoutCurrentSession({
    presentedTokenHash: sha256Hex(presented),
    auditId: generateUuidV7(),
    outboxId: generateUuidV7(),
    correlationId: options.correlationId ?? null,
    reason: "logout"
  });

  if (outcome === "invalid") {
    throw new OidcAuthError("Session invalid or revoked.", "AUTH_SESSION_REVOKED");
  }
  // already_revoked → still success (idempotent logout)
  return { cleared: true };
}

export async function revokeSession(options: {
  readonly sessions: SessionAuthRepository;
  readonly actorUserId: string;
  readonly sessionId: string;
  readonly csrfCookie: string | undefined;
  readonly csrfHeader: string | undefined;
  readonly correlationId?: string | null;
}): Promise<void> {
  assertCsrfDoubleSubmit(options.csrfCookie, options.csrfHeader);
  const outcome = await options.sessions.revokeSessionById({
    actorUserId: options.actorUserId,
    sessionId: options.sessionId,
    auditId: generateUuidV7(),
    outboxId: generateUuidV7(),
    correlationId: options.correlationId ?? null
  });
  if (outcome === "not_found") {
    throw new OidcAuthError("Session not found.", "RESOURCE_NOT_FOUND");
  }
  if (outcome === "already_revoked") {
    throw new OidcAuthError("Session already revoked.", "DEVICE_ALREADY_REVOKED");
  }
}

export async function revokeDevice(options: {
  readonly sessions: SessionAuthRepository;
  readonly actorUserId: string;
  readonly deviceId: string;
  readonly csrfCookie: string | undefined;
  readonly csrfHeader: string | undefined;
  readonly correlationId?: string | null;
}): Promise<void> {
  assertCsrfDoubleSubmit(options.csrfCookie, options.csrfHeader);
  const outcome = await options.sessions.revokeDeviceById({
    actorUserId: options.actorUserId,
    deviceId: options.deviceId,
    auditId: generateUuidV7(),
    correlationId: options.correlationId ?? null
  });
  if (outcome === "not_found") {
    throw new OidcAuthError("Device not found.", "RESOURCE_NOT_FOUND");
  }
  if (outcome === "already_revoked") {
    throw new OidcAuthError("Device already revoked.", "DEVICE_ALREADY_REVOKED");
  }
}

export async function listDevices(options: {
  readonly sessions: SessionAuthRepository;
  readonly actorUserId: string;
}): Promise<{
  readonly data: ReadonlyArray<Record<string, unknown>>;
  readonly meta: { readonly next_cursor: null };
}> {
  const rows = await options.sessions.listDevicesForUser(options.actorUserId);
  return {
    data: rows.map((d) => ({
      id: d.id,
      user_id: d.user_id,
      platform: d.platform,
      label: d.label,
      trusted: d.trusted,
      trust_status: d.revoked_at ? "revoked" : d.trust_status,
      created_at: d.created_at,
      last_seen_at: d.last_seen_at,
      current: false
    })),
    meta: { next_cursor: null }
  };
}
