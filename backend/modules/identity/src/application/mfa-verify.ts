import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  createOpaqueToken,
  OidcAuthError,
  sha256Hex,
  type OidcClientConfig,
  type SessionAuthRepository,
  type SessionBootstrap
} from "./oidc-types.js";
import {
  currentTotpCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode
} from "./crypto-auth.js";

export type MfaChallengePurpose = "login" | "step_up";

export interface MfaChallengeRecord {
  readonly id: string;
  readonly userId: string;
  readonly purpose: MfaChallengePurpose;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly metadata: Record<string, unknown>;
}

export interface MfaStore {
  createChallenge(args: {
    readonly id: UuidV7;
    readonly userId: string;
    readonly purpose: MfaChallengePurpose;
    readonly expiresAt: Date;
    readonly metadata: Record<string, unknown>;
  }): Promise<void>;

  peekChallenge(challengeId: string): Promise<MfaChallengeRecord | null>;

  consumeChallenge(challengeId: string): Promise<
    | { readonly outcome: "ok"; readonly userId: string; readonly purpose: MfaChallengePurpose; readonly metadata: Record<string, unknown> }
    | { readonly outcome: "invalid" }
  >;

  listVerifiedTotpSecrets(userId: string): Promise<readonly string[]>;

  tryConsumeRecoveryCode(userId: string, codeHash: string): Promise<boolean>;

  enrollTotp(args: {
    readonly userId: string;
    readonly factorId: UuidV7;
    readonly secret: string;
    readonly label?: string | null;
  }): Promise<void>;

  replaceRecoveryCodes(userId: string, codeHashes: readonly string[]): Promise<void>;

  markRecentAuth(sessionId: string, at: Date): Promise<void>;

  getRecentAuthAt(sessionId: string): Promise<Date | null>;
}

/** Extended session ops needed after MFA login challenge succeeds. */
export interface MfaSessionRepository extends SessionAuthRepository {
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
}

export const DEFAULT_STEP_UP_WINDOW_MINUTES = 10;

export async function enrollTotpFactor(options: {
  readonly mfa: MfaStore;
  readonly userId: string;
  readonly label?: string | null;
}): Promise<{ readonly secret: string; readonly recovery_codes: readonly string[]; readonly factor_id: string }> {
  const secret = generateTotpSecret();
  const factorId = generateUuidV7();
  await options.mfa.enrollTotp({
    userId: options.userId,
    factorId,
    secret,
    label: options.label ?? null
  });
  const recovery = generateRecoveryCodes(8);
  await options.mfa.replaceRecoveryCodes(
    options.userId,
    recovery.map((c) => hashRecoveryCode(c))
  );
  return { secret, recovery_codes: recovery, factor_id: factorId };
}

export function assertRecentAuth(options: {
  readonly lastMfaAt: Date | null | undefined;
  readonly now?: Date;
  readonly windowMinutes?: number;
}): void {
  const now = options.now ?? new Date();
  const windowMs = (options.windowMinutes ?? DEFAULT_STEP_UP_WINDOW_MINUTES) * 60 * 1000;
  if (!options.lastMfaAt || now.getTime() - options.lastMfaAt.getTime() > windowMs) {
    throw new OidcAuthError("Recent authentication required.", "AUTH_RECENT_AUTH_REQUIRED");
  }
}

export async function createLoginMfaChallenge(options: {
  readonly mfa: MfaStore;
  readonly userId: string;
  readonly metadata: Record<string, unknown>;
  readonly ttlMinutes?: number;
  readonly now?: Date;
}): Promise<string> {
  const now = options.now ?? new Date();
  const id = generateUuidV7();
  await options.mfa.createChallenge({
    id,
    userId: options.userId,
    purpose: "login",
    expiresAt: new Date(now.getTime() + (options.ttlMinutes ?? 10) * 60 * 1000),
    metadata: options.metadata
  });
  return id;
}

export async function createStepUpMfaChallenge(options: {
  readonly mfa: MfaStore;
  readonly userId: string;
  readonly sessionId: string;
  readonly ttlMinutes?: number;
  readonly now?: Date;
}): Promise<string> {
  const now = options.now ?? new Date();
  const id = generateUuidV7();
  await options.mfa.createChallenge({
    id,
    userId: options.userId,
    purpose: "step_up",
    expiresAt: new Date(now.getTime() + (options.ttlMinutes ?? 10) * 60 * 1000),
    metadata: { session_id: options.sessionId }
  });
  return id;
}

export async function verifyMfa(options: {
  readonly mfa: MfaStore;
  readonly sessions: MfaSessionRepository;
  readonly config: Pick<OidcClientConfig, "sessionAbsoluteTtlHours" | "refreshTtlDays">;
  readonly challengeId: string;
  readonly code: string;
  readonly correlationId?: string | null;
  readonly now?: Date;
}): Promise<{
  readonly body: {
    readonly data: {
      readonly access_token: string | null;
      readonly expires_in: number | null;
      readonly mfa_required: boolean;
      readonly mfa_challenge_id: string | null;
      readonly session_id: string | null;
    };
    readonly meta: Record<string, never>;
  };
  readonly refreshTokenPlaintext: string | null;
  readonly csrfToken: string | null;
  readonly bootstrap: SessionBootstrap | null;
}> {
  const challengeId = options.challengeId.trim();
  const code = options.code.trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(challengeId)) {
    throw new OidcAuthError("Invalid MFA challenge.", "VALIDATION_FAILED");
  }
  if (!/^[0-9]{6}$/.test(code) && code.length < 8) {
    // TOTP is 6 digits; recovery codes are longer hex — OpenAPI only allows 6-digit for verifyMfa.
    // Contract freezes 6-digit code; recovery via same field when pattern matches digits only.
    throw new OidcAuthError("Invalid MFA code.", "AUTH_MFA_INVALID");
  }
  if (!/^[0-9]{6}$/.test(code)) {
    throw new OidcAuthError("Invalid MFA code.", "AUTH_MFA_INVALID");
  }

  const peeked = await options.mfa.peekChallenge(challengeId);
  if (!peeked || peeked.consumedAt || peeked.expiresAt.getTime() <= (options.now ?? new Date()).getTime()) {
    throw new OidcAuthError("Invalid MFA challenge.", "AUTH_MFA_INVALID");
  }

  const secrets = await options.mfa.listVerifiedTotpSecrets(peeked.userId);
  const now = options.now ?? new Date();
  let valid = secrets.some((secret) => verifyTotpCode(secret, code, now));

  if (!valid) {
    // Allow recovery codes that happen to be 6 digits only if stored — primary path is TOTP per OpenAPI.
    valid = await options.mfa.tryConsumeRecoveryCode(peeked.userId, hashRecoveryCode(code));
  }

  if (!valid) {
    throw new OidcAuthError("Invalid MFA code.", "AUTH_MFA_INVALID");
  }

  const consumed = await options.mfa.consumeChallenge(challengeId);
  if (consumed.outcome !== "ok") {
    throw new OidcAuthError("Invalid MFA challenge.", "AUTH_MFA_INVALID");
  }

  if (consumed.purpose === "step_up") {
    const sessionId = String(consumed.metadata.session_id ?? "");
    if (!sessionId) {
      throw new OidcAuthError("Invalid MFA challenge.", "AUTH_MFA_INVALID");
    }
    await options.mfa.markRecentAuth(sessionId, now);
    return {
      body: {
        data: {
          access_token: null,
          expires_in: null,
          mfa_required: false,
          mfa_challenge_id: null,
          session_id: sessionId
        },
        meta: {}
      },
      refreshTokenPlaintext: null,
      csrfToken: null,
      bootstrap: null
    };
  }

  // login purpose — establish full session from pending metadata
  const meta = consumed.metadata;
  const refreshPlain =
    typeof meta.refresh_token_plaintext === "string" ? meta.refresh_token_plaintext : createOpaqueToken();
  const sessionId = (meta.session_id as UuidV7 | undefined) ?? generateUuidV7();
  const refreshId = (meta.refresh_id as UuidV7 | undefined) ?? generateUuidV7();
  const deviceId = (meta.device_id as UuidV7 | undefined) ?? generateUuidV7();
  const familyId = (meta.family_id as UuidV7 | undefined) ?? generateUuidV7();
  const absoluteExpiry = meta.absolute_expiry
    ? new Date(String(meta.absolute_expiry))
    : new Date(now.getTime() + options.config.sessionAbsoluteTtlHours * 60 * 60 * 1000);
  const refreshExpires = meta.refresh_expires
    ? new Date(String(meta.refresh_expires))
    : new Date(now.getTime() + options.config.refreshTtlDays * 24 * 60 * 60 * 1000);

  const bootstrap = await options.sessions.establishSessionAfterMfa({
    userId: consumed.userId,
    tenantHint: typeof meta.tenant_hint === "string" ? meta.tenant_hint : null,
    correlationId: options.correlationId ?? null,
    sessionId,
    refreshId,
    deviceId,
    familyId,
    auditId: generateUuidV7(),
    refreshTokenHash: sha256Hex(refreshPlain),
    absoluteExpiry,
    refreshExpires,
    displayName: typeof meta.display_name === "string" ? meta.display_name : null
  });

  await options.mfa.markRecentAuth(bootstrap.session.id, now);
  const csrfToken = createOpaqueToken();

  return {
    body: {
      data: {
        access_token: null,
        expires_in: null,
        mfa_required: false,
        mfa_challenge_id: null,
        session_id: bootstrap.session.id
      },
      meta: {}
    },
    refreshTokenPlaintext: refreshPlain,
    csrfToken,
    bootstrap
  };
}

/** Test helper — current TOTP for enrolled secret. */
export { currentTotpCode, generateTotpSecret };
