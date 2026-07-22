import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import type { UuidV7 } from "@ai-sales/domain-kernel";
import {
  OidcAuthError,
  sha256Hex,
  type OidcStateStore,
  type SessionAuthRepository,
  type SessionBootstrap,
  type StoredOidcState
} from "../../application/oidc-types.js";

export class PostgresOidcStateStore implements OidcStateStore {
  constructor(private readonly db: AppDatabase) {}

  async save(
    state: StoredOidcState & { readonly statePlain: string; readonly noncePlain: string }
  ): Promise<void> {
    await sql`
      select app.oidc_save_login_state(
        ${state.stateHash},
        ${state.nonceHash},
        ${state.codeVerifier},
        ${state.returnTo},
        ${state.tenantHint},
        ${state.correlationId},
        ${state.expiresAt.toISOString()}::timestamptz
      )
    `.execute(this.db);
  }

  async consume(statePlain: string): Promise<Omit<StoredOidcState, "stateHash" | "expiresAt"> | null> {
    const result = await sql<{
      nonce_hash: string;
      code_verifier: string;
      return_to: string;
      tenant_hint: string | null;
      correlation_id: string | null;
    }>`
      select * from app.oidc_consume_login_state(${sha256Hex(statePlain)})
    `.execute(this.db);
    const row = result.rows[0];
    if (!row) return null;
    return {
      nonceHash: row.nonce_hash,
      codeVerifier: row.code_verifier,
      returnTo: row.return_to,
      tenantHint: row.tenant_hint,
      correlationId: row.correlation_id
    };
  }
}

export class PostgresSessionAuthRepository implements SessionAuthRepository {
  constructor(private readonly db: AppDatabase) {}

  async establishOidcSession(args: {
    readonly provider: string;
    readonly subject: string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly displayName: string | null;
    readonly tenantHint: string | null;
    readonly correlationId: string | null;
    readonly userId: UuidV7;
    readonly sessionId: UuidV7;
    readonly refreshId: UuidV7;
    readonly deviceId: UuidV7;
    readonly familyId: UuidV7;
    readonly auditId: UuidV7;
    readonly refreshTokenHash: string;
    readonly absoluteExpiry: Date;
    readonly refreshExpires: Date;
  }): Promise<
    | { readonly mfaRequired: true; readonly userId: string }
    | { readonly mfaRequired: false; readonly bootstrap: SessionBootstrap }
  > {
    try {
      const result = await sql<{
        user_id: string;
        tenant_id: string;
        membership_id: string;
        session_id: string | null;
        device_id: string | null;
        session_version: string | number | null;
        session_expires_at: Date | null;
        display_name: string;
        user_locale: string;
        tenant_name: string;
        tenant_currency: string;
        tenant_timezone: string;
        mfa_required: boolean;
        permissions: string[] | null;
      }>`
        select * from app.oidc_establish_session(
          ${args.provider},
          ${args.subject},
          ${args.email},
          ${args.emailVerified},
          ${args.displayName},
          ${args.tenantHint},
          ${args.userId}::uuid,
          ${args.sessionId}::uuid,
          ${args.refreshId}::uuid,
          ${args.deviceId}::uuid,
          ${args.refreshTokenHash},
          ${args.familyId}::uuid,
          ${args.absoluteExpiry.toISOString()}::timestamptz,
          ${args.refreshExpires.toISOString()}::timestamptz,
          ${args.correlationId},
          ${args.auditId}::uuid
        )
      `.execute(this.db);

      const row = result.rows[0];
      if (!row) {
        throw new OidcAuthError("OIDC session establish returned empty.", "AUTH_OIDC_EXCHANGE_FAILED");
      }
      if (row.mfa_required) {
        return { mfaRequired: true, userId: row.user_id };
      }
      return {
        mfaRequired: false,
        bootstrap: {
          user: {
            id: row.user_id,
            display_name: row.display_name,
            locale: row.user_locale,
            timezone: row.tenant_timezone
          },
          tenant: {
            id: row.tenant_id,
            name: row.tenant_name,
            currency: row.tenant_currency,
            timezone: row.tenant_timezone
          },
          session: {
            id: row.session_id!,
            version: Number(row.session_version ?? 1),
            expires_at: new Date(row.session_expires_at!).toISOString(),
            reauth_required_at: null
          },
          device: { id: row.device_id!, trusted: false },
          permissions: row.permissions ?? [],
          feature_flags: {}
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("OIDC_NO_MEMBERSHIP")) {
        throw new OidcAuthError("No active tenant membership.", "NO_MEMBERSHIP");
      }
      throw error;
    }
  }

  async establishSessionAfterMfa(args: {
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
  }): Promise<SessionBootstrap> {
    try {
      const result = await sql<{
        user_id: string;
        tenant_id: string;
        membership_id: string;
        session_id: string;
        device_id: string;
        session_version: string | number;
        session_expires_at: Date;
        display_name: string;
        user_locale: string;
        tenant_name: string;
        tenant_currency: string;
        tenant_timezone: string;
        permissions: string[] | null;
      }>`
        select * from app.oidc_establish_session_after_mfa(
          ${args.userId}::uuid,
          ${args.tenantHint},
          ${args.displayName},
          ${args.sessionId}::uuid,
          ${args.refreshId}::uuid,
          ${args.deviceId}::uuid,
          ${args.refreshTokenHash},
          ${args.familyId}::uuid,
          ${args.absoluteExpiry.toISOString()}::timestamptz,
          ${args.refreshExpires.toISOString()}::timestamptz,
          ${args.correlationId},
          ${args.auditId}::uuid
        )
      `.execute(this.db);
      const row = result.rows[0];
      if (!row) {
        throw new OidcAuthError("OIDC session establish returned empty.", "AUTH_OIDC_EXCHANGE_FAILED");
      }
      return {
        user: {
          id: row.user_id,
          display_name: row.display_name,
          locale: row.user_locale,
          timezone: row.tenant_timezone
        },
        tenant: {
          id: row.tenant_id,
          name: row.tenant_name,
          currency: row.tenant_currency,
          timezone: row.tenant_timezone
        },
        session: {
          id: row.session_id,
          version: Number(row.session_version ?? 1),
          expires_at: new Date(row.session_expires_at).toISOString(),
          reauth_required_at: null
        },
        device: { id: row.device_id, trusted: false },
        permissions: row.permissions ?? [],
        feature_flags: {}
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("OIDC_NO_MEMBERSHIP")) {
        throw new OidcAuthError("No active tenant membership.", "NO_MEMBERSHIP");
      }
      throw error;
    }
  }

  async resolveByRefreshTokenHash(tokenHash: string): Promise<SessionBootstrap | null> {
    const result = await sql<{
      user_id: string;
      tenant_id: string;
      session_id: string;
      device_id: string;
      session_version: string | number;
      session_expires_at: Date;
      display_name: string;
      user_locale: string;
      tenant_name: string;
      tenant_currency: string;
      tenant_timezone: string;
      device_trusted: boolean;
      permissions: string[] | null;
    }>`
      select * from app.oidc_resolve_session_by_refresh_hash(${tokenHash})
    `.execute(this.db);
    const row = result.rows[0];
    if (!row) return null;
    return {
      user: {
        id: row.user_id,
        display_name: row.display_name,
        locale: row.user_locale,
        timezone: row.tenant_timezone
      },
      tenant: {
        id: row.tenant_id,
        name: row.tenant_name,
        currency: row.tenant_currency,
        timezone: row.tenant_timezone
      },
      session: {
        id: row.session_id,
        version: Number(row.session_version),
        expires_at: new Date(row.session_expires_at).toISOString(),
        reauth_required_at: null
      },
      device: { id: row.device_id, trusted: row.device_trusted },
      permissions: row.permissions ?? [],
      feature_flags: {}
    };
  }

  async rotateRefreshFamily(args: {
    readonly presentedTokenHash: string;
    readonly newRefreshId: UuidV7;
    readonly newTokenHash: string;
    readonly newExpiresAt: Date;
    readonly auditId: UuidV7;
    readonly correlationId: string | null;
  }): Promise<
    | { readonly outcome: "rotated"; readonly bootstrap: SessionBootstrap }
    | { readonly outcome: "reused" }
    | { readonly outcome: "invalid" }
  > {
    const result = await sql<{
      outcome: string;
      user_id: string | null;
      tenant_id: string | null;
      session_id: string | null;
      device_id: string | null;
      session_version: string | number | null;
      session_expires_at: Date | null;
      display_name: string | null;
      user_locale: string | null;
      tenant_name: string | null;
      tenant_currency: string | null;
      tenant_timezone: string | null;
      device_trusted: boolean | null;
      permissions: string[] | null;
    }>`
      select * from app.refresh_rotate_family(
        ${args.presentedTokenHash},
        ${args.newRefreshId}::uuid,
        ${args.newTokenHash},
        ${args.newExpiresAt.toISOString()}::timestamptz,
        ${args.auditId}::uuid,
        ${args.correlationId}
      )
    `.execute(this.db);

    const row = result.rows[0];
    if (!row || row.outcome === "invalid") return { outcome: "invalid" };
    if (row.outcome === "reused") return { outcome: "reused" };
    return {
      outcome: "rotated",
      bootstrap: {
        user: {
          id: row.user_id!,
          display_name: row.display_name!,
          locale: row.user_locale!,
          timezone: row.tenant_timezone!
        },
        tenant: {
          id: row.tenant_id!,
          name: row.tenant_name!,
          currency: row.tenant_currency!,
          timezone: row.tenant_timezone!
        },
        session: {
          id: row.session_id!,
          version: Number(row.session_version ?? 1),
          expires_at: new Date(row.session_expires_at!).toISOString(),
          reauth_required_at: null
        },
        device: { id: row.device_id!, trusted: row.device_trusted ?? false },
        permissions: row.permissions ?? [],
        feature_flags: {}
      }
    };
  }

  async logoutCurrentSession(args: {
    readonly presentedTokenHash: string;
    readonly auditId: UuidV7;
    readonly outboxId: UuidV7;
    readonly correlationId: string | null;
    readonly reason: string;
  }): Promise<"revoked" | "already_revoked" | "invalid"> {
    const result = await sql<{ outcome: string }>`
      select outcome from app.identity_revoke_current_session(
        ${args.presentedTokenHash},
        ${args.auditId}::uuid,
        ${args.outboxId}::uuid,
        ${args.correlationId},
        ${args.reason}
      )
    `.execute(this.db);
    const outcome = result.rows[0]?.outcome;
    if (outcome === "revoked" || outcome === "already_revoked" || outcome === "invalid") {
      return outcome;
    }
    return "invalid";
  }

  async revokeSessionById(args: {
    readonly actorUserId: string;
    readonly sessionId: string;
    readonly auditId: UuidV7;
    readonly outboxId: UuidV7;
    readonly correlationId: string | null;
  }): Promise<"revoked" | "already_revoked" | "not_found"> {
    const result = await sql<{ outcome: string }>`
      select outcome from app.identity_revoke_session_by_id(
        ${args.actorUserId}::uuid,
        ${args.sessionId}::uuid,
        ${args.auditId}::uuid,
        ${args.outboxId}::uuid,
        ${args.correlationId}
      )
    `.execute(this.db);
    const outcome = result.rows[0]?.outcome;
    if (outcome === "revoked" || outcome === "already_revoked" || outcome === "not_found") {
      return outcome;
    }
    return "not_found";
  }

  async revokeDeviceById(args: {
    readonly actorUserId: string;
    readonly deviceId: string;
    readonly auditId: UuidV7;
    readonly correlationId: string | null;
  }): Promise<"revoked" | "already_revoked" | "not_found"> {
    const result = await sql<{ outcome: string }>`
      select outcome from app.identity_revoke_device(
        ${args.actorUserId}::uuid,
        ${args.deviceId}::uuid,
        ${args.auditId}::uuid,
        ${args.correlationId}
      )
    `.execute(this.db);
    const outcome = result.rows[0]?.outcome;
    if (outcome === "revoked" || outcome === "already_revoked" || outcome === "not_found") {
      return outcome;
    }
    return "not_found";
  }

  async listDevicesForUser(actorUserId: string): Promise<
    ReadonlyArray<{
      readonly id: string;
      readonly user_id: string;
      readonly platform: string;
      readonly label: string | null;
      readonly trusted: boolean;
      readonly trust_status: string;
      readonly created_at: string;
      readonly last_seen_at: string | null;
      readonly revoked_at: string | null;
    }>
  > {
    const result = await sql<{
      id: string;
      user_id: string;
      platform: string;
      label: string | null;
      trusted: boolean;
      trust_status: string;
      created_at: Date;
      last_seen_at: Date | null;
      revoked_at: Date | null;
    }>`
      select * from app.identity_list_devices(${actorUserId}::uuid)
    `.execute(this.db);
    return result.rows.map((d) => ({
      id: d.id,
      user_id: d.user_id,
      platform: d.platform,
      label: d.label,
      trusted: d.trusted,
      trust_status: d.trust_status,
      created_at: new Date(d.created_at).toISOString(),
      last_seen_at: d.last_seen_at ? new Date(d.last_seen_at).toISOString() : null,
      revoked_at: d.revoked_at ? new Date(d.revoked_at).toISOString() : null
    }));
  }

  async switchTenant(args: {
    readonly presentedTokenHash: string;
    readonly targetTenantId: string;
    readonly auditId: UuidV7;
    readonly correlationId: string | null;
  }): Promise<
    | { readonly outcome: "ok"; readonly bootstrap: SessionBootstrap }
    | {
        readonly outcome:
          | "unauthorized"
          | "tenant_context_invalid"
          | "membership_inactive"
          | "tenant_inactive";
      }
  > {
    const result = await sql<{
      outcome: string;
      user_id: string | null;
      tenant_id: string | null;
      session_id: string | null;
      device_id: string | null;
      session_version: string | number | null;
      session_expires_at: Date | null;
      display_name: string | null;
      user_locale: string | null;
      tenant_name: string | null;
      tenant_currency: string | null;
      tenant_timezone: string | null;
      device_trusted: boolean | null;
      permissions: string[] | null;
    }>`
      select * from app.session_switch_tenant(
        ${args.presentedTokenHash},
        ${args.targetTenantId}::uuid,
        ${args.auditId}::uuid,
        ${args.correlationId}
      )
    `.execute(this.db);

    const row = result.rows[0];
    if (!row) return { outcome: "unauthorized" };
    if (row.outcome !== "ok") {
      return {
        outcome: row.outcome as
          | "unauthorized"
          | "tenant_context_invalid"
          | "membership_inactive"
          | "tenant_inactive"
      };
    }

    return {
      outcome: "ok",
      bootstrap: {
        user: {
          id: row.user_id!,
          display_name: row.display_name!,
          locale: row.user_locale!,
          timezone: row.tenant_timezone!
        },
        tenant: {
          id: row.tenant_id!,
          name: row.tenant_name!,
          currency: row.tenant_currency!,
          timezone: row.tenant_timezone!
        },
        session: {
          id: row.session_id!,
          version: Number(row.session_version ?? 1),
          expires_at: new Date(row.session_expires_at!).toISOString(),
          reauth_required_at: null
        },
        device: { id: row.device_id!, trusted: Boolean(row.device_trusted) },
        permissions: row.permissions ?? [],
        feature_flags: {}
      }
    };
  }
}
