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

export function generateOAuthStateToken(): string {
  return randomBytes(24).toString("base64url");
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
