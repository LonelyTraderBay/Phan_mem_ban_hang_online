import { OidcAuthError, sha256Hex, type SessionAuthRepository, type SessionBootstrap } from "./oidc-types.js";

export async function getCurrentContext(options: {
  readonly sessions: SessionAuthRepository;
  readonly sessionCookieValue: string | undefined;
}): Promise<{ readonly data: SessionBootstrap; readonly meta: Record<string, never> }> {
  const raw = options.sessionCookieValue?.trim();
  if (!raw) {
    throw new OidcAuthError("Session required.", "AUTH_UNAUTHORIZED");
  }
  const bootstrap = await options.sessions.resolveByRefreshTokenHash(sha256Hex(raw));
  if (!bootstrap) {
    throw new OidcAuthError("Session invalid or expired.", "AUTH_UNAUTHORIZED");
  }
  return { data: bootstrap, meta: {} };
}
