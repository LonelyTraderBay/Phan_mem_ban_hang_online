import { createHash, randomBytes } from "node:crypto";

/**
 * BE-CHN-003 — OAuth state + PKCE stubs (no browser secrets in logs).
 */

export interface OAuthStateRecord {
  readonly stateToken: string;
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly expiresAt: string;
}

export function generatePkcePair(): { readonly codeVerifier: string; readonly codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

/**
 * Embed tenantId so consumeOAuthState can resolve RLS tenant after restart /
 * cross-instance callback (state_token alone is not enough under FORCE RLS).
 * Format: `{tenantUuid}.{random}`
 */
export function generateOAuthStateToken(tenantId?: string): string {
  const nonce = randomBytes(24).toString("base64url");
  if (!tenantId?.trim()) return nonce;
  return `${tenantId.trim()}.${nonce}`;
}

/** Parse tenant UUID prefix from state tokens produced by generateOAuthStateToken. */
export function tenantIdFromOAuthStateToken(stateToken: string): string | null {
  const dot = stateToken.indexOf(".");
  if (dot <= 0) return null;
  const maybeTenant = stateToken.slice(0, dot);
  // UUID v4/v7 shape (8-4-4-4-12)
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(maybeTenant)
  ) {
    return null;
  }
  return maybeTenant;
}

export function hashCodeVerifier(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("hex");
}

export function buildOAuthAuthorizeUrlStub(args: {
  readonly provider: string;
  readonly stateToken: string;
  readonly codeChallenge: string;
  readonly redirectUri: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    state: args.stateToken,
    code_challenge: args.codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: args.redirectUri
  });
  return `https://oauth.stub/${args.provider}/authorize?${params.toString()}`;
}

export function isOAuthStateExpired(expiresAt: string, now = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
