import { createLoginMfaChallenge, type MfaStore } from "./mfa-verify.js";
import {
  createOpaqueToken,
  newIds,
  OidcAuthError,
  sha256Hex,
  type EstablishedSession,
  type OidcClientConfig,
  type OidcStateStore,
  type OidcTokenClient,
  type SessionAuthRepository
} from "./oidc-types.js";

export async function completeOidcLogin(options: {
  readonly config: OidcClientConfig;
  readonly stateStore: OidcStateStore;
  readonly tokenClient: OidcTokenClient;
  readonly sessions: SessionAuthRepository;
  readonly mfa?: MfaStore;
  readonly query: {
    readonly code?: string | null;
    readonly state?: string | null;
    readonly error?: string | null;
    readonly errorDescription?: string | null;
  };
  readonly correlationId?: string | null;
  readonly now?: Date;
}): Promise<
  | { readonly kind: "redirect"; readonly location: string; readonly session?: EstablishedSession }
  | never
> {
  if (!options.config.enabled) {
    throw new OidcAuthError("OIDC login is disabled.", "OIDC_DISABLED");
  }

  if (options.query.error) {
    throw new OidcAuthError(
      `IdP error: ${options.query.error}`,
      "AUTH_OIDC_PROVIDER_ERROR"
    );
  }

  const statePlain = options.query.state?.trim();
  const code = options.query.code?.trim();
  if (!statePlain || !code) {
    throw new OidcAuthError("Missing OIDC state or code.", "AUTH_OIDC_STATE_INVALID");
  }

  const stored = await options.stateStore.consume(statePlain);
  if (!stored) {
    throw new OidcAuthError("OIDC state invalid or expired.", "AUTH_OIDC_STATE_INVALID");
  }

  let claims;
  try {
    claims = await options.tokenClient.exchangeCode({
      code,
      codeVerifier: stored.codeVerifier,
      expectedNonceHash: stored.nonceHash
    });
  } catch (error) {
    if (error instanceof OidcAuthError) throw error;
    throw new OidcAuthError("OIDC code exchange failed.", "AUTH_OIDC_EXCHANGE_FAILED");
  }

  if (!claims.email) {
    throw new OidcAuthError("OIDC identity missing email.", "AUTH_OIDC_EXCHANGE_FAILED");
  }

  const now = options.now ?? new Date();
  const absoluteExpiry = new Date(now.getTime() + options.config.sessionAbsoluteTtlHours * 60 * 60 * 1000);
  const refreshExpires = new Date(now.getTime() + options.config.refreshTtlDays * 24 * 60 * 60 * 1000);
  const refreshPlain = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  const ids = newIds();

  let established;
  try {
    established = await options.sessions.establishOidcSession({
      provider: options.config.providerName,
      subject: claims.sub,
      email: claims.email,
      emailVerified: claims.emailVerified,
      displayName: claims.name,
      tenantHint: stored.tenantHint,
      correlationId: stored.correlationId ?? options.correlationId ?? null,
      userId: ids.userId,
      sessionId: ids.sessionId,
      refreshId: ids.refreshId,
      deviceId: ids.deviceId,
      familyId: ids.familyId,
      auditId: ids.auditId,
      refreshTokenHash: sha256Hex(refreshPlain),
      absoluteExpiry,
      refreshExpires
    });
  } catch (error) {
    if (error instanceof OidcAuthError) throw error;
    throw error;
  }

  if (established.mfaRequired) {
    if (!options.mfa) {
      return { kind: "redirect", location: "/2fa" };
    }
    const challengeId = await createLoginMfaChallenge({
      mfa: options.mfa,
      userId: established.userId,
      now,
      metadata: {
        return_to: stored.returnTo,
        tenant_hint: stored.tenantHint,
        display_name: claims.name,
        refresh_token_plaintext: refreshPlain,
        session_id: ids.sessionId,
        refresh_id: ids.refreshId,
        device_id: ids.deviceId,
        family_id: ids.familyId,
        absolute_expiry: absoluteExpiry.toISOString(),
        refresh_expires: refreshExpires.toISOString()
      }
    });
    return { kind: "redirect", location: `/2fa?challenge_id=${encodeURIComponent(challengeId)}` };
  }

  return {
    kind: "redirect",
    location: stored.returnTo,
    session: {
      bootstrap: established.bootstrap,
      refreshTokenPlaintext: refreshPlain,
      csrfToken,
      mfaRequired: false,
      returnTo: stored.returnTo
    }
  };
}
