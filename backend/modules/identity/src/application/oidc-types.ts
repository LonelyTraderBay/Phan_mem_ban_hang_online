import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";
export const DEFAULT_SESSION_COOKIE_NAME = "ais_session";

export type OidcErrorCode =
  | "AUTH_OIDC_STATE_INVALID"
  | "AUTH_OIDC_EXCHANGE_FAILED"
  | "AUTH_OIDC_PROVIDER_ERROR"
  | "VALIDATION_FAILED"
  | "OIDC_DISABLED"
  | "AUTH_UNAUTHORIZED"
  | "NO_MEMBERSHIP"
  | "AUTH_REFRESH_REUSED"
  | "AUTH_SESSION_REVOKED"
  | "AUTH_MFA_INVALID"
  | "AUTH_RECENT_AUTH_REQUIRED"
  | "TENANT_CONTEXT_INVALID"
  | "MEMBERSHIP_INACTIVE"
  | "TENANT_INACTIVE"
  | "CSRF_TOKEN_INVALID"
  | "DEVICE_ALREADY_REVOKED"
  | "RESOURCE_NOT_FOUND";

export class OidcAuthError extends Error {
  constructor(
    message: string,
    readonly code: OidcErrorCode
  ) {
    super(message);
    this.name = "OidcAuthError";
  }
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
  return { verifier, challenge };
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Double-submit CSRF: header must equal non-HttpOnly csrf_token cookie. */
export function assertCsrfDoubleSubmit(cookieToken: string | undefined, headerToken: string | undefined): void {
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    throw new OidcAuthError("CSRF token invalid.", "CSRF_TOKEN_INVALID");
  }
}

export function normalizeReturnTo(returnTo: string | undefined | null): string {
  const value = (returnTo ?? "/").trim() || "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    throw new OidcAuthError("Invalid return_to.", "VALIDATION_FAILED");
  }
  if (value.length > 512) {
    throw new OidcAuthError("Invalid return_to.", "VALIDATION_FAILED");
  }
  return value;
}

export interface OidcClientConfig {
  readonly enabled: boolean;
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly scopes: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly providerName: string;
  readonly sessionCookieName: string;
  readonly sessionCookieSecure: boolean;
  readonly sessionAbsoluteTtlHours: number;
  readonly refreshTtlDays: number;
}

export interface StoredOidcState {
  readonly stateHash: string;
  readonly nonceHash: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
  readonly tenantHint: string | null;
  readonly correlationId: string | null;
  readonly expiresAt: Date;
}

export interface OidcIdentityClaims {
  readonly sub: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | null;
  readonly nonce: string | null;
}

export interface SessionBootstrap {
  readonly user: {
    readonly id: string;
    readonly display_name: string;
    readonly locale: string;
    readonly timezone: string;
  };
  readonly tenant: {
    readonly id: string;
    readonly name: string;
    readonly currency: string;
    readonly timezone: string;
  };
  readonly session: {
    readonly id: string;
    readonly version: number;
    readonly expires_at: string;
    readonly reauth_required_at: string | null;
  };
  readonly device: {
    readonly id: string;
    readonly trusted: boolean;
  };
  readonly permissions: readonly string[];
  readonly feature_flags: Record<string, { enabled: boolean; variant?: string }>;
  readonly entitlements?: Record<string, unknown>;
}

export interface EstablishedSession {
  readonly bootstrap: SessionBootstrap;
  readonly refreshTokenPlaintext: string;
  readonly csrfToken: string;
  readonly mfaRequired: boolean;
  readonly returnTo: string;
}

export interface OidcStateStore {
  save(state: StoredOidcState & { readonly statePlain: string; readonly noncePlain: string }): Promise<void>;
  consume(statePlain: string): Promise<Omit<StoredOidcState, "stateHash" | "expiresAt"> | null>;
}

export interface OidcTokenClient {
  exchangeCode(args: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly expectedNonceHash: string;
  }): Promise<OidcIdentityClaims>;
}

export interface SessionAuthRepository {
  establishOidcSession(args: {
    readonly provider: string;
    readonly subject: string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly displayName: string | null;
    readonly tenantHint: string | null;
    readonly correlationId: string | null;
    readonly userId: UuidV7;
    readonly sessionId: UuidV7;
    readonly refreshId: UuidV7;
    readonly deviceId: UuidV7;
    readonly familyId: UuidV7;
    readonly auditId: UuidV7;
    readonly refreshTokenHash: string;
    readonly absoluteExpiry: Date;
    readonly refreshExpires: Date;
  }): Promise<
    | { readonly mfaRequired: true; readonly userId: string }
    | { readonly mfaRequired: false; readonly bootstrap: SessionBootstrap }
  >;

  /**
   * Completes login after MFA challenge success (session was deferred at OIDC establish).
   */
  establishSessionAfterMfa(args: {
    readonly userId: string;
    readonly tenantHint: string | null;
    readonly correlationId: string | null;
    readonly sessionId: UuidV7;
    readonly refreshId: UuidV7;
    readonly deviceId: UuidV7;
    readonly familyId: UuidV7;
    readonly auditId: UuidV7;
    readonly refreshTokenHash: string;
    readonly absoluteExpiry: Date;
    readonly refreshExpires: Date;
    readonly displayName: string | null;
  }): Promise<SessionBootstrap>;

  resolveByRefreshTokenHash(tokenHash: string): Promise<SessionBootstrap | null>;

  /**
   * Atomically rotate refresh token family.
   * - Success: mark presented used, insert child with same family_id.
   * - Reuse of already-used token: revoke entire family + session → AUTH_REFRESH_REUSED.
   * Race-safe via row lock / mutex (exactly one child per unused parent).
   */
  rotateRefreshFamily(args: {
    readonly presentedTokenHash: string;
    readonly newRefreshId: UuidV7;
    readonly newTokenHash: string;
    readonly newExpiresAt: Date;
    readonly auditId: UuidV7;
    readonly correlationId: string | null;
  }): Promise<
    | { readonly outcome: "rotated"; readonly bootstrap: SessionBootstrap }
    | { readonly outcome: "reused" }
    | { readonly outcome: "invalid" }
  >;

  logoutCurrentSession(args: {
    readonly presentedTokenHash: string;
    readonly auditId: UuidV7;
    readonly outboxId: UuidV7;
    readonly correlationId: string | null;
    readonly reason: string;
  }): Promise<"revoked" | "already_revoked" | "invalid">;

  revokeSessionById(args: {
    readonly actorUserId: string;
    readonly sessionId: string;
    readonly auditId: UuidV7;
    readonly outboxId: UuidV7;
    readonly correlationId: string | null;
  }): Promise<"revoked" | "already_revoked" | "not_found">;

  revokeDeviceById(args: {
    readonly actorUserId: string;
    readonly deviceId: string;
    readonly auditId: UuidV7;
    readonly correlationId: string | null;
  }): Promise<"revoked" | "already_revoked" | "not_found">;

  listDevicesForUser(actorUserId: string): Promise<
    ReadonlyArray<{
      readonly id: string;
      readonly user_id: string;
      readonly platform: string;
      readonly label: string | null;
      readonly trusted: boolean;
      readonly trust_status: string;
      readonly created_at: string;
      readonly last_seen_at: string | null;
      readonly revoked_at: string | null;
    }>
  >;

  /**
   * Bind session to another active membership tenant.
   * Updates session.tenant_id / membership_id; does not rotate refresh cookie.
   */
  switchTenant(args: {
    readonly presentedTokenHash: string;
    readonly targetTenantId: string;
    readonly auditId: UuidV7;
    readonly correlationId: string | null;
  }): Promise<
    | { readonly outcome: "ok"; readonly bootstrap: SessionBootstrap }
    | {
        readonly outcome:
          | "unauthorized"
          | "tenant_context_invalid"
          | "membership_inactive"
          | "tenant_inactive";
      }
  >;
}

export function newIds() {
  return {
    userId: generateUuidV7(),
    sessionId: generateUuidV7(),
    refreshId: generateUuidV7(),
    deviceId: generateUuidV7(),
    familyId: generateUuidV7(),
    auditId: generateUuidV7()
  };
}
