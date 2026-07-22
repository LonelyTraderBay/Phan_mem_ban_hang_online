import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import type { UuidV7 } from "@ai-sales/domain-kernel";
import type { PasswordResetStore } from "../../application/password-reset.js";
import type { MfaChallengePurpose, MfaStore } from "../../application/mfa-verify.js";

export class PostgresPasswordResetStore implements PasswordResetStore {
  constructor(private readonly db: AppDatabase) {}

  async requestReset(args: {
    readonly email: string;
    readonly tokenId: UuidV7;
    readonly tokenHash: string;
    readonly expiresAt: Date;
  }): Promise<{ readonly issued: boolean }> {
    const result = await sql<{ issued: boolean }>`
      select * from app.password_reset_request(
        ${args.email},
        ${args.tokenId}::uuid,
        ${args.tokenHash},
        ${args.expiresAt.toISOString()}::timestamptz
      )
    `.execute(this.db);
    return { issued: Boolean(result.rows[0]?.issued) };
  }

  async consumeReset(args: {
    readonly tokenHash: string;
    readonly passwordHash: string;
    readonly auditId: UuidV7;
  }): Promise<"ok" | "invalid"> {
    const result = await sql<{ outcome: string }>`
      select * from app.password_reset_consume(
        ${args.tokenHash},
        ${args.passwordHash},
        ${args.auditId}::uuid
      )
    `.execute(this.db);
    return result.rows[0]?.outcome === "ok" ? "ok" : "invalid";
  }
}

export class PostgresMfaStore implements MfaStore {
  constructor(private readonly db: AppDatabase) {}

  async createChallenge(args: {
    readonly id: UuidV7;
    readonly userId: string;
    readonly purpose: MfaChallengePurpose;
    readonly expiresAt: Date;
    readonly metadata: Record<string, unknown>;
  }): Promise<void> {
    await sql`
      select app.mfa_challenge_create(
        ${args.id}::uuid,
        ${args.userId}::uuid,
        ${args.purpose},
        ${args.expiresAt.toISOString()}::timestamptz,
        ${JSON.stringify(args.metadata)}::jsonb
      )
    `.execute(this.db);
  }

  async peekChallenge(challengeId: string) {
    const result = await sql<{
      id: string;
      user_id: string;
      purpose: MfaChallengePurpose;
      expires_at: Date;
      consumed_at: Date | null;
      metadata: Record<string, unknown>;
    }>`
      select id, user_id, purpose, expires_at, consumed_at, metadata
      from app.mfa_challenge_peek(${challengeId}::uuid)
    `.execute(this.db);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      purpose: row.purpose,
      expiresAt: new Date(row.expires_at),
      consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
      metadata: row.metadata ?? {}
    };
  }

  async consumeChallenge(challengeId: string) {
    const result = await sql<{
      outcome: string;
      user_id: string | null;
      purpose: MfaChallengePurpose | null;
      metadata: Record<string, unknown> | null;
    }>`
      select * from app.mfa_challenge_consume(${challengeId}::uuid)
    `.execute(this.db);
    const row = result.rows[0];
    if (!row || row.outcome !== "ok" || !row.user_id || !row.purpose) {
      return { outcome: "invalid" as const };
    }
    return {
      outcome: "ok" as const,
      userId: row.user_id,
      purpose: row.purpose,
      metadata: row.metadata ?? {}
    };
  }

  async listVerifiedTotpSecrets(userId: string): Promise<readonly string[]> {
    const result = await sql<{ secret: string }>`
      select secret from app.mfa_list_verified_totp_secrets(${userId}::uuid)
    `.execute(this.db);
    return result.rows.map((r) => r.secret);
  }

  async tryConsumeRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
    const result = await sql<{ ok: boolean }>`
      select * from app.mfa_consume_recovery_code(${userId}::uuid, ${codeHash})
    `.execute(this.db);
    return Boolean(result.rows[0]?.ok);
  }

  async enrollTotp(args: {
    readonly userId: string;
    readonly factorId: UuidV7;
    readonly secret: string;
    readonly label?: string | null;
  }): Promise<void> {
    await sql`
      select app.mfa_enroll_totp(
        ${args.factorId}::uuid,
        ${args.userId}::uuid,
        ${args.secret},
        ${args.label ?? null}
      )
    `.execute(this.db);
  }

  async replaceRecoveryCodes(userId: string, codeHashes: readonly string[]): Promise<void> {
    await sql`
      select app.mfa_replace_recovery_codes(
        ${userId}::uuid,
        ${JSON.stringify(codeHashes)}::jsonb
      )
    `.execute(this.db);
  }

  async markRecentAuth(sessionId: string, at: Date): Promise<void> {
    await sql`
      select app.session_mark_recent_auth(
        ${sessionId}::uuid,
        ${at.toISOString()}::timestamptz
      )
    `.execute(this.db);
  }

  async getRecentAuthAt(sessionId: string): Promise<Date | null> {
    const result = await sql<{ recent_at: Date | null }>`
      select * from app.session_get_recent_auth(${sessionId}::uuid)
    `.execute(this.db);
    const at = result.rows[0]?.recent_at;
    return at ? new Date(at) : null;
  }
}
