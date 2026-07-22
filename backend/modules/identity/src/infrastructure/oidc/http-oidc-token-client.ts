import { createHash } from "node:crypto";
import { OidcAuthError, sha256Hex, type OidcClientConfig, type OidcIdentityClaims, type OidcTokenClient } from "../../application/oidc-types.js";

function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split(".");
  if (parts.length < 2) {
    throw new OidcAuthError("Invalid id_token.", "AUTH_OIDC_EXCHANGE_FAILED");
  }
  const json = Buffer.from(parts[1]!, "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Confidential-client code exchange against OIDC token endpoint.
 * Validates nonce claim when present; does not yet verify JWKS signature (tracked as follow-up hardening).
 */
export class HttpOidcTokenClient implements OidcTokenClient {
  constructor(private readonly config: OidcClientConfig) {}

  async exchangeCode(args: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly expectedNonceHash: string;
  }): Promise<OidcIdentityClaims> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code_verifier: args.codeVerifier
    });

    let response: Response;
    try {
      response = await fetch(this.config.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body
      });
    } catch {
      throw new OidcAuthError("OIDC token endpoint unreachable.", "AUTH_OIDC_EXCHANGE_FAILED");
    }

    if (!response.ok) {
      throw new OidcAuthError("OIDC code exchange failed.", "AUTH_OIDC_EXCHANGE_FAILED");
    }

    const json = (await response.json()) as { id_token?: string; access_token?: string };
    if (!json.id_token) {
      throw new OidcAuthError("OIDC response missing id_token.", "AUTH_OIDC_EXCHANGE_FAILED");
    }

    const claims = decodeJwtPayload(json.id_token);
    const sub = typeof claims.sub === "string" ? claims.sub : "";
    const email = typeof claims.email === "string" ? claims.email : "";
    const nonce = typeof claims.nonce === "string" ? claims.nonce : null;
    if (!sub || !email) {
      throw new OidcAuthError("OIDC id_token missing sub/email.", "AUTH_OIDC_EXCHANGE_FAILED");
    }
    if (nonce) {
      if (sha256Hex(nonce) !== args.expectedNonceHash) {
        throw new OidcAuthError("OIDC nonce mismatch.", "AUTH_OIDC_STATE_INVALID");
      }
    }

    return {
      sub,
      email,
      emailVerified: claims.email_verified === true,
      name: typeof claims.name === "string" ? claims.name : null,
      nonce
    };
  }
}

export async function resolveOidcEndpoints(config: {
  issuer: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
}): Promise<{ authorizationEndpoint: string; tokenEndpoint: string }> {
  if (config.authorizationEndpoint && config.tokenEndpoint) {
    return {
      authorizationEndpoint: config.authorizationEndpoint,
      tokenEndpoint: config.tokenEndpoint
    };
  }
  const discoveryUrl = `${config.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(discoveryUrl);
  if (!res.ok) {
    throw new OidcAuthError("OIDC discovery failed.", "OIDC_DISABLED");
  }
  const doc = (await res.json()) as {
    authorization_endpoint?: string;
    token_endpoint?: string;
  };
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new OidcAuthError("OIDC discovery incomplete.", "OIDC_DISABLED");
  }
  return {
    authorizationEndpoint: config.authorizationEndpoint ?? doc.authorization_endpoint,
    tokenEndpoint: config.tokenEndpoint ?? doc.token_endpoint
  };
}

export function providerNameFromIssuer(issuer: string): string {
  try {
    return createHash("sha256").update(new URL(issuer).host, "utf8").digest("hex").slice(0, 16);
  } catch {
    return "oidc";
  }
}
