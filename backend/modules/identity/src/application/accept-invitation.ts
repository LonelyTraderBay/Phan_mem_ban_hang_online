import { generateUuidV7 } from "@ai-sales/domain-kernel";
import { hashPassword } from "./crypto-auth.js";
import {
  createOpaqueToken,
  OidcAuthError,
  sha256Hex,
  type OidcClientConfig,
  type SessionAuthRepository,
  type SessionBootstrap
} from "./oidc-types.js";

export type AcceptInviteErrorCode =
  | "INVITE_EXPIRED"
  | "INVITE_REVOKED"
  | "INVITE_ALREADY_ACCEPTED"
  | "INVITATION_TOKEN_INVALID"
  | "VALIDATION_FAILED";

export class AcceptInvitationError extends Error {
  constructor(
    message: string,
    readonly code: AcceptInviteErrorCode
  ) {
    super(message);
    this.name = "AcceptInvitationError";
  }
}

export interface InvitationAcceptStore {
  acceptInvitation(args: {
    readonly tokenHash: string;
    readonly passwordHash: string | null;
    readonly now: Date;
  }): Promise<
    | {
        readonly outcome: "ok";
        readonly tenantId: string;
        readonly userId: string;
        readonly membershipId: string;
        readonly email: string;
        readonly displayName: string | null;
        readonly roleIds: readonly string[];
        readonly permissions: readonly string[];
      }
    | {
        readonly outcome:
          | "INVITE_EXPIRED"
          | "INVITE_REVOKED"
          | "INVITE_ALREADY_ACCEPTED"
          | "INVITATION_TOKEN_INVALID";
      }
  >;
}

/** Optional session binder for accept → AuthResponse with cookies. */
export interface AcceptSessionBinder {
  bindAcceptedMembership(args: {
    readonly userId: string;
    readonly tenantId: string;
    readonly email: string;
    readonly displayName: string | null;
    readonly permissions: readonly string[];
    readonly sessionId: string;
    readonly deviceId: string;
    readonly refreshId: string;
    readonly familyId: string;
    readonly refreshTokenHash: string;
    readonly absoluteExpiry: Date;
    readonly refreshExpires: Date;
  }): Promise<SessionBootstrap>;
}

export async function acceptInvitation(options: {
  readonly store: InvitationAcceptStore;
  readonly token: string;
  readonly password?: string | null;
  readonly sessions?: SessionAuthRepository;
  readonly binder?: AcceptSessionBinder;
  readonly config?: Pick<OidcClientConfig, "sessionAbsoluteTtlHours" | "refreshTtlDays">;
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
  const token = options.token.trim();
  if (token.length < 16 || token.length > 256) {
    throw new AcceptInvitationError("Invalid invitation token.", "INVITATION_TOKEN_INVALID");
  }

  let passwordHash: string | null = null;
  if (options.password != null && options.password !== "") {
    if (options.password.length < 8 || options.password.length > 256) {
      throw new AcceptInvitationError("Invalid password.", "VALIDATION_FAILED");
    }
    passwordHash = await hashPassword(options.password);
  }

  const now = options.now ?? new Date();
  const accepted = await options.store.acceptInvitation({
    tokenHash: sha256Hex(token),
    passwordHash,
    now
  });

  if (accepted.outcome !== "ok") {
    throw new AcceptInvitationError("Invitation rejected.", accepted.outcome);
  }

  if (!options.binder || !options.config) {
    return {
      body: {
        data: {
          access_token: null,
          expires_in: null,
          mfa_required: false,
          mfa_challenge_id: null,
          session_id: null
        },
        meta: {}
      },
      refreshTokenPlaintext: null,
      csrfToken: null,
      bootstrap: null
    };
  }

  const refreshPlain = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  const sessionId = generateUuidV7();
  const deviceId = generateUuidV7();
  const refreshId = generateUuidV7();
  const familyId = generateUuidV7();
  const absoluteExpiry = new Date(
    now.getTime() + options.config.sessionAbsoluteTtlHours * 60 * 60 * 1000
  );
  const refreshExpires = new Date(now.getTime() + options.config.refreshTtlDays * 24 * 60 * 60 * 1000);

  const bootstrap = await options.binder.bindAcceptedMembership({
    userId: accepted.userId,
    tenantId: accepted.tenantId,
    email: accepted.email,
    displayName: accepted.displayName,
    permissions: accepted.permissions,
    sessionId,
    deviceId,
    refreshId,
    familyId,
    refreshTokenHash: sha256Hex(refreshPlain),
    absoluteExpiry,
    refreshExpires
  });

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

export function mapAcceptError(error: unknown): never {
  if (error instanceof AcceptInvitationError) {
    throw new OidcAuthError(error.message, error.code === "VALIDATION_FAILED" ? "VALIDATION_FAILED" : "AUTH_UNAUTHORIZED");
  }
  throw error;
}
