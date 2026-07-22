import { generateUuidV7 } from "@ai-sales/domain-kernel";
import {
  assertCsrfDoubleSubmit,
  createOpaqueToken,
  OidcAuthError,
  sha256Hex,
  type OidcClientConfig,
  type SessionAuthRepository,
  type SessionBootstrap
} from "./oidc-types.js";

export interface RefreshSessionResult {
  readonly body: {
    readonly data: {
      readonly access_token: string | null;
      readonly expires_in: number | null;
      readonly mfa_required: boolean;
      readonly mfa_challenge_id: string | null;
      readonly session_id: string;
    };
    readonly meta: Record<string, never>;
  };
  readonly newRefreshTokenPlaintext: string;
  readonly csrfToken: string;
  readonly bootstrap: SessionBootstrap;
}

export async function refreshSession(options: {
  readonly config: Pick<OidcClientConfig, "refreshTtlDays">;
  readonly sessions: SessionAuthRepository;
  readonly presentedRefreshToken: string | undefined;
  readonly csrfCookie: string | undefined;
  readonly csrfHeader: string | undefined;
  readonly correlationId?: string | null;
  readonly now?: Date;
}): Promise<RefreshSessionResult> {
  assertCsrfDoubleSubmit(options.csrfCookie, options.csrfHeader);

  const presented = options.presentedRefreshToken?.trim();
  if (!presented) {
    throw new OidcAuthError("Session required.", "AUTH_UNAUTHORIZED");
  }

  const now = options.now ?? new Date();
  const newPlain = createOpaqueToken();
  const newRefreshId = generateUuidV7();
  const auditId = generateUuidV7();
  const newExpires = new Date(now.getTime() + options.config.refreshTtlDays * 24 * 60 * 60 * 1000);

  const rotated = await options.sessions.rotateRefreshFamily({
    presentedTokenHash: sha256Hex(presented),
    newRefreshId,
    newTokenHash: sha256Hex(newPlain),
    newExpiresAt: newExpires,
    auditId,
    correlationId: options.correlationId ?? null
  });

  if (rotated.outcome === "reused") {
    throw new OidcAuthError("Refresh token reuse detected.", "AUTH_REFRESH_REUSED");
  }
  if (rotated.outcome === "invalid") {
    throw new OidcAuthError("Session invalid or revoked.", "AUTH_SESSION_REVOKED");
  }

  const csrfToken = createOpaqueToken();

  return {
    body: {
      data: {
        access_token: null,
        expires_in: null,
        mfa_required: false,
        mfa_challenge_id: null,
        session_id: rotated.bootstrap.session.id
      },
      meta: {}
    },
    newRefreshTokenPlaintext: newPlain,
    csrfToken,
    bootstrap: rotated.bootstrap
  };
}
