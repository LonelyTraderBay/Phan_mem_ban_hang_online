import { createOpaqueToken, createPkcePair, normalizeReturnTo, OidcAuthError, sha256Hex, type OidcClientConfig, type OidcStateStore } from "./oidc-types.js";

export async function startOidcLogin(options: {
  readonly config: OidcClientConfig;
  readonly stateStore: OidcStateStore;
  readonly returnTo?: string | null;
  readonly tenantHint?: string | null;
  readonly correlationId?: string | null;
  readonly now?: Date;
}): Promise<{ readonly status: 302; readonly location: string }> {
  if (!options.config.enabled) {
    throw new OidcAuthError("OIDC login is disabled.", "OIDC_DISABLED");
  }

  const returnTo = normalizeReturnTo(options.returnTo);
  const tenantHint = options.tenantHint?.trim() ? options.tenantHint.trim().slice(0, 100) : null;
  const state = createOpaqueToken();
  const nonce = createOpaqueToken();
  const pkce = createPkcePair();
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

  await options.stateStore.save({
    statePlain: state,
    noncePlain: nonce,
    stateHash: sha256Hex(state),
    nonceHash: sha256Hex(nonce),
    codeVerifier: pkce.verifier,
    returnTo,
    tenantHint,
    correlationId: options.correlationId ?? null,
    expiresAt
  });

  const url = new URL(options.config.authorizationEndpoint);
  url.searchParams.set("client_id", options.config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", options.config.scopes);
  url.searchParams.set("redirect_uri", options.config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { status: 302, location: url.toString() };
}
