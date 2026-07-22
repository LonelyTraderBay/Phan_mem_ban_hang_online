import { createPublicKey } from "node:crypto";
import {
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  errors as JoseErrors
} from "jose";
import type { ActorType, RequestSecurityContext } from "@ai-sales/auth-context";
import { parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";

export type AccessTokenErrorCode =
  | "AUTH_TOKEN_EXPIRED"
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_SESSION_REVOKED";

export class AccessTokenError extends Error {
  constructor(
    message: string,
    readonly code: AccessTokenErrorCode
  ) {
    super(message);
    this.name = "AccessTokenError";
  }
}

export interface AccessTokenClaims {
  readonly sub: UuidV7;
  readonly tid: UuidV7;
  readonly sid: UuidV7;
  readonly act: ActorType;
  readonly mid?: UuidV7;
  readonly iss: string;
  readonly aud: string;
  readonly exp: number;
  readonly iat: number;
  readonly kid: string;
}

export interface IssueAccessTokenInput {
  readonly subject: UuidV7;
  readonly tenantId: UuidV7;
  readonly sessionId: UuidV7;
  readonly actorType: ActorType;
  readonly membershipId?: UuidV7;
  readonly now?: Date;
}

export interface IssuedAccessToken {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly expiresAt: Date;
  readonly kid: string;
}

export interface AccessTokenKeyRingOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly ttlSeconds: number;
  readonly active: {
    readonly kid: string;
    readonly privateKeyPem: string;
    /** Optional; derived from private PEM when omitted. */
    readonly publicKeyPem?: string;
  };
  /** Previous key public material — accepted during rotation window. */
  readonly previous?: {
    readonly kid: string;
    readonly publicKeyPem: string;
  };
  readonly algorithm?: "ES256";
}

export interface AccessTokenService {
  issue(input: IssueAccessTokenInput): Promise<IssuedAccessToken>;
  verify(token: string, now?: Date): Promise<AccessTokenClaims>;
  readonly activeKid: string;
  readonly previousKid: string | null;
}

const ACTOR_TYPES = new Set<ActorType>(["user", "service", "ai", "system", "support"]);

type JoseKey = Awaited<ReturnType<typeof importPKCS8>>;

function normalizePem(pem: string): string {
  return pem.trim().replace(/\\n/g, "\n");
}

function derivePublicSpkiPem(privateKeyPem: string): string {
  // Node derives the public key when given a private PEM string.
  const publicKey = createPublicKey(normalizePem(privateKeyPem));
  return publicKey.export({ type: "spki", format: "pem" }).toString();
}

async function importPrivate(pem: string): Promise<JoseKey> {
  return importPKCS8(normalizePem(pem), "ES256");
}

async function importPublic(pem: string): Promise<JoseKey> {
  return importSPKI(normalizePem(pem), "ES256");
}

/** Generate an ES256 key pair for local/dev/tests; returns PEM strings. */
export async function generateEs256KeyPairPem(): Promise<{ privateKeyPem: string; publicKeyPem: string }> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  return {
    privateKeyPem: await exportPKCS8(privateKey),
    publicKeyPem: await exportSPKI(publicKey)
  };
}

export async function createAccessTokenService(options: AccessTokenKeyRingOptions): Promise<AccessTokenService> {
  const algorithm = options.algorithm ?? "ES256";
  if (options.ttlSeconds < 60 || options.ttlSeconds > 3600) {
    throw new Error("JWT access TTL must be between 60 and 3600 seconds.");
  }
  if (!options.issuer || !options.audience) {
    throw new Error("JWT issuer and audience are required.");
  }
  if (options.previous && options.previous.kid === options.active.kid) {
    throw new Error("JWT previous kid must differ from active kid.");
  }

  const activePrivate = await importPrivate(options.active.privateKeyPem);
  const activePublicPem = options.active.publicKeyPem ?? derivePublicSpkiPem(options.active.privateKeyPem);
  const activePublic = await importPublic(activePublicPem);

  const verificationKeys = new Map<string, JoseKey>();
  verificationKeys.set(options.active.kid, activePublic);
  if (options.previous) {
    verificationKeys.set(options.previous.kid, await importPublic(options.previous.publicKeyPem));
  }

  return {
    activeKid: options.active.kid,
    previousKid: options.previous?.kid ?? null,

    async issue(input: IssueAccessTokenInput): Promise<IssuedAccessToken> {
      const now = input.now ?? new Date();
      const iat = Math.floor(now.getTime() / 1000);
      const exp = iat + options.ttlSeconds;
      const accessToken = await new SignJWT({
        tid: input.tenantId,
        sid: input.sessionId,
        act: input.actorType,
        ...(input.membershipId !== undefined ? { mid: input.membershipId } : {})
      })
        .setProtectedHeader({ alg: algorithm, kid: options.active.kid, typ: "JWT" })
        .setSubject(input.subject)
        .setIssuer(options.issuer)
        .setAudience(options.audience)
        .setIssuedAt(iat)
        .setExpirationTime(exp)
        .sign(activePrivate);

      return {
        accessToken,
        expiresIn: options.ttlSeconds,
        expiresAt: new Date(exp * 1000),
        kid: options.active.kid
      };
    },

    async verify(token: string, now?: Date): Promise<AccessTokenClaims> {
      const clockTimestamp = Math.floor((now ?? new Date()).getTime() / 1000);
      try {
        const { payload, protectedHeader } = await jwtVerify(
          token,
          async (header) => {
            const kid = header.kid;
            if (!kid || !verificationKeys.has(kid)) {
              throw new AccessTokenError("Unknown JWT kid.", "AUTH_INVALID_CREDENTIALS");
            }
            return verificationKeys.get(kid)!;
          },
          {
            issuer: options.issuer,
            audience: options.audience,
            algorithms: [algorithm],
            currentDate: new Date(clockTimestamp * 1000)
          }
        );

        const kid = typeof protectedHeader.kid === "string" ? protectedHeader.kid : "";
        if (!kid) {
          throw new AccessTokenError("JWT kid missing.", "AUTH_INVALID_CREDENTIALS");
        }

        const act = payload.act;
        if (typeof act !== "string" || !ACTOR_TYPES.has(act as ActorType)) {
          throw new AccessTokenError("JWT act claim invalid.", "AUTH_INVALID_CREDENTIALS");
        }
        if (typeof payload.sub !== "string" || typeof payload.tid !== "string" || typeof payload.sid !== "string") {
          throw new AccessTokenError("JWT subject claims invalid.", "AUTH_INVALID_CREDENTIALS");
        }
        if (typeof payload.iss !== "string" || payload.iss !== options.issuer) {
          throw new AccessTokenError("JWT issuer invalid.", "AUTH_INVALID_CREDENTIALS");
        }
        const aud = payload.aud;
        const audOk = aud === options.audience || (Array.isArray(aud) && aud.includes(options.audience));
        if (!audOk) {
          throw new AccessTokenError("JWT audience invalid.", "AUTH_INVALID_CREDENTIALS");
        }
        if (typeof payload.exp !== "number" || typeof payload.iat !== "number") {
          throw new AccessTokenError("JWT time claims invalid.", "AUTH_INVALID_CREDENTIALS");
        }

        return {
          sub: parseUuidV7(payload.sub),
          tid: parseUuidV7(payload.tid),
          sid: parseUuidV7(payload.sid),
          act: act as ActorType,
          iss: payload.iss,
          aud: options.audience,
          exp: payload.exp,
          iat: payload.iat,
          kid,
          ...(typeof payload.mid === "string" ? { mid: parseUuidV7(payload.mid) } : {})
        };
      } catch (error) {
        if (error instanceof AccessTokenError) throw error;
        if (error instanceof JoseErrors.JWTExpired) {
          throw new AccessTokenError("Access token expired.", "AUTH_TOKEN_EXPIRED");
        }
        if (error instanceof JoseErrors.JWTClaimValidationFailed && error.claim === "aud") {
          throw new AccessTokenError("JWT audience invalid.", "AUTH_INVALID_CREDENTIALS");
        }
        if (error instanceof JoseErrors.JWTClaimValidationFailed && error.claim === "iss") {
          throw new AccessTokenError("JWT issuer invalid.", "AUTH_INVALID_CREDENTIALS");
        }
        throw new AccessTokenError("Access token invalid.", "AUTH_INVALID_CREDENTIALS");
      }
    }
  };
}

/** Extract raw bearer token from Authorization header. */
export function parseBearerAuthorization(header: string | undefined | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * Map verified access claims into RequestSecurityContext.
 * Permissions are NOT trusted from the JWT — caller supplies server-resolved permissions.
 */
export function securityContextFromAccessToken(
  claims: AccessTokenClaims,
  options: {
    readonly permissions: readonly string[];
    readonly correlationId: string;
    readonly tenantTimezone?: string;
  }
): RequestSecurityContext {
  return {
    actorType: claims.act,
    actorId: claims.sub,
    tenantId: claims.tid,
    permissions: options.permissions,
    tenantTimezone: options.tenantTimezone ?? "UTC",
    correlationId: options.correlationId,
    ...(claims.mid !== undefined ? { membershipId: claims.mid } : {})
  };
}
