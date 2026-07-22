import type { UuidV7 } from "@ai-sales/domain-kernel";
import {
  OidcAuthError,
  sha256Hex,
  type OidcIdentityClaims,
  type OidcStateStore,
  type OidcTokenClient,
  type SessionAuthRepository,
  type SessionBootstrap,
  type StoredOidcState
} from "../../application/oidc-types.js";

export class InMemoryOidcStateStore implements OidcStateStore {
  readonly rows = new Map<string, StoredOidcState & { consumedAt?: Date }>();

  async save(
    state: StoredOidcState & { readonly statePlain: string; readonly noncePlain: string }
  ): Promise<void> {
    this.rows.set(state.stateHash, {
      stateHash: state.stateHash,
      nonceHash: state.nonceHash,
      codeVerifier: state.codeVerifier,
      returnTo: state.returnTo,
      tenantHint: state.tenantHint,
      correlationId: state.correlationId,
      expiresAt: state.expiresAt
    });
  }

  async consume(statePlain: string): Promise<Omit<StoredOidcState, "stateHash" | "expiresAt"> | null> {
    const hash = sha256Hex(statePlain);
    const row = this.rows.get(hash);
    if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    row.consumedAt = new Date();
    return {
      nonceHash: row.nonceHash,
      codeVerifier: row.codeVerifier,
      returnTo: row.returnTo,
      tenantHint: row.tenantHint,
      correlationId: row.correlationId
    };
  }
}

export interface MemoryMembership {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly status: "active" | "invited" | "suspended" | "revoked";
  readonly displayName: string | null;
  readonly permissions: readonly string[];
}

export interface MemoryTenant {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly currency: string;
  readonly timezone: string;
  readonly status: "active" | "suspended" | "closed" | "provisioning";
}

export interface MemoryUser {
  readonly id: string;
  primaryEmail: string;
  locale: string;
  status: string;
}

export class InMemorySessionAuthRepository implements SessionAuthRepository {
  readonly users = new Map<string, MemoryUser>();
  readonly credentials = new Map<string, { provider: string; subject: string; userId: string }>();
  readonly passwordCredentials = new Map<string, { userId: string; passwordHash: string }>();
  readonly tenants = new Map<string, MemoryTenant>();
  readonly memberships: MemoryMembership[] = [];
  readonly mfaUserIds = new Set<string>();
  readonly revokedSessions = new Set<string>();
  readonly devices = new Map<
    string,
    {
      id: string;
      userId: string;
      platform: string;
      label: string | null;
      trusted: boolean;
      trustStatus: string;
      createdAt: Date;
      lastSeenAt: Date | null;
      revokedAt: Date | null;
    }
  >();
  readonly refreshByHash = new Map<
    string,
    {
      id: string;
      familyId: string;
      parentId: string | null;
      bootstrap: SessionBootstrap;
      revoked: boolean;
      expiresAt: Date;
      usedAt: Date | null;
      reuseDetectedAt: Date | null;
    }
  >();
  readonly outbox: Array<{ type: string; sessionId: string; reason: string }> = [];
  readonly passwordResetTokens = new Map<
    string,
    { userId: string; tokenHash: string; expiresAt: Date; consumedAt: Date | null }
  >();
  readonly lastPlainResetTokenByEmail = new Map<string, string>();
  readonly mfaChallenges = new Map<
    string,
    {
      id: string;
      userId: string;
      purpose: "login" | "step_up";
      expiresAt: Date;
      consumedAt: Date | null;
      metadata: Record<string, unknown>;
    }
  >();
  readonly totpSecrets = new Map<string, string[]>();
  readonly recoveryCodeHashes = new Map<string, Set<string>>();
  readonly recentAuthAt = new Map<string, Date>();
  private chain: Promise<void> = Promise.resolve();

  /** Serialize refresh mutations for race-safe unit tests. */
  private async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  seedTenantUser(args: {
    user: MemoryUser;
    tenant: MemoryTenant;
    membership: MemoryMembership;
    oidc?: { provider: string; subject: string };
    passwordHash?: string;
  }): void {
    this.users.set(args.user.id, args.user);
    this.tenants.set(args.tenant.id, args.tenant);
    this.memberships.push(args.membership);
    if (args.oidc) {
      this.credentials.set(`${args.oidc.provider}:${args.oidc.subject}`, {
        provider: args.oidc.provider,
        subject: args.oidc.subject,
        userId: args.user.id
      });
    }
    if (args.passwordHash) {
      this.passwordCredentials.set(args.user.primaryEmail.toLowerCase(), {
        userId: args.user.id,
        passwordHash: args.passwordHash
      });
    }
  }

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
    let userId =
      this.credentials.get(`${args.provider}:${args.subject}`)?.userId ??
      [...this.users.values()].find((u) => u.primaryEmail === args.email.toLowerCase())?.id;

    if (!userId) {
      userId = args.userId;
      this.users.set(userId, {
        id: userId,
        primaryEmail: args.email.toLowerCase(),
        locale: "vi-VN",
        status: "active"
      });
    }
    this.credentials.set(`${args.provider}:${args.subject}`, {
      provider: args.provider,
      subject: args.subject,
      userId
    });

    if (this.mfaUserIds.has(userId) || (this.totpSecrets.get(userId)?.length ?? 0) > 0) {
      return { mfaRequired: true, userId };
    }

    const bootstrap = this.buildBootstrap({
      userId,
      tenantHint: args.tenantHint,
      displayName: args.displayName,
      email: args.email,
      sessionId: args.sessionId,
      deviceId: args.deviceId,
      absoluteExpiry: args.absoluteExpiry
    });

    this.refreshByHash.set(args.refreshTokenHash, {
      id: args.refreshId,
      familyId: args.familyId,
      parentId: null,
      bootstrap,
      revoked: false,
      expiresAt: args.refreshExpires,
      usedAt: null,
      reuseDetectedAt: null
    });
    this.devices.set(args.deviceId, {
      id: args.deviceId,
      userId,
      platform: "web",
      label: "Web Admin",
      trusted: false,
      trustStatus: "pending",
      createdAt: new Date(),
      lastSeenAt: new Date(),
      revokedAt: null
    });
    return { mfaRequired: false, bootstrap };
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
    const user = this.users.get(args.userId);
    if (!user) {
      throw new OidcAuthError("No active tenant membership.", "NO_MEMBERSHIP");
    }
    const bootstrap = this.buildBootstrap({
      userId: args.userId,
      tenantHint: args.tenantHint,
      displayName: args.displayName,
      email: user.primaryEmail,
      sessionId: args.sessionId,
      deviceId: args.deviceId,
      absoluteExpiry: args.absoluteExpiry
    });
    this.refreshByHash.set(args.refreshTokenHash, {
      id: args.refreshId,
      familyId: args.familyId,
      parentId: null,
      bootstrap,
      revoked: false,
      expiresAt: args.refreshExpires,
      usedAt: null,
      reuseDetectedAt: null
    });
    this.devices.set(args.deviceId, {
      id: args.deviceId,
      userId: args.userId,
      platform: "web",
      label: "Web Admin",
      trusted: false,
      trustStatus: "pending",
      createdAt: new Date(),
      lastSeenAt: new Date(),
      revokedAt: null
    });
    return bootstrap;
  }

  private buildBootstrap(args: {
    userId: string;
    tenantHint: string | null;
    displayName: string | null;
    email: string;
    sessionId: string;
    deviceId: string;
    absoluteExpiry: Date;
  }): SessionBootstrap {
    let membership = args.tenantHint
      ? this.memberships.find((m) => {
          const t = this.tenants.get(m.tenantId);
          return (
            m.userId === args.userId &&
            m.status === "active" &&
            t?.status === "active" &&
            t.code.toLowerCase() === args.tenantHint!.toLowerCase()
          );
        })
      : undefined;
    membership ??= this.memberships.find(
      (m) => m.userId === args.userId && m.status === "active" && this.tenants.get(m.tenantId)?.status === "active"
    );
    if (!membership) {
      throw new OidcAuthError("No active tenant membership.", "NO_MEMBERSHIP");
    }
    const tenant = this.tenants.get(membership.tenantId)!;
    const user = this.users.get(args.userId)!;
    return {
      user: {
        id: args.userId,
        display_name: membership.displayName ?? args.displayName ?? args.email.split("@")[0]!,
        locale: user.locale,
        timezone: tenant.timezone
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        currency: tenant.currency,
        timezone: tenant.timezone
      },
      session: {
        id: args.sessionId,
        version: 1,
        expires_at: args.absoluteExpiry.toISOString(),
        reauth_required_at: null
      },
      device: { id: args.deviceId, trusted: false },
      permissions: [...membership.permissions],
      feature_flags: {}
    };
  }

  // --- Password reset ---
  async requestReset(args: {
    readonly email: string;
    readonly tokenId: UuidV7;
    readonly tokenHash: string;
    readonly expiresAt: Date;
  }): Promise<{ readonly issued: boolean }> {
    const cred = this.passwordCredentials.get(args.email.toLowerCase());
    if (!cred) return { issued: false };
    for (const [k, row] of this.passwordResetTokens) {
      if (row.userId === cred.userId && !row.consumedAt) {
        row.consumedAt = new Date();
        this.passwordResetTokens.set(k, row);
      }
    }
    this.passwordResetTokens.set(args.tokenHash, {
      userId: cred.userId,
      tokenHash: args.tokenHash,
      expiresAt: args.expiresAt,
      consumedAt: null
    });
    return { issued: true };
  }

  async consumeReset(args: {
    readonly tokenHash: string;
    readonly passwordHash: string;
    readonly auditId: UuidV7;
  }): Promise<"ok" | "invalid"> {
    const row = this.passwordResetTokens.get(args.tokenHash);
    if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) return "invalid";
    row.consumedAt = new Date();
    const email = [...this.passwordCredentials.entries()].find(([, c]) => c.userId === row.userId)?.[0];
    if (!email) return "invalid";
    this.passwordCredentials.set(email, { userId: row.userId, passwordHash: args.passwordHash });
    for (const refresh of this.refreshByHash.values()) {
      if (refresh.bootstrap.user.id === row.userId) {
        refresh.revoked = true;
        this.revokedSessions.add(refresh.bootstrap.session.id);
      }
    }
    return "ok";
  }

  peekLastPlainToken(email: string): string | undefined {
    return this.lastPlainResetTokenByEmail.get(email.toLowerCase());
  }

  // --- MFA store ---
  async createChallenge(args: {
    readonly id: UuidV7;
    readonly userId: string;
    readonly purpose: "login" | "step_up";
    readonly expiresAt: Date;
    readonly metadata: Record<string, unknown>;
  }): Promise<void> {
    this.mfaChallenges.set(args.id, {
      id: args.id,
      userId: args.userId,
      purpose: args.purpose,
      expiresAt: args.expiresAt,
      consumedAt: null,
      metadata: args.metadata
    });
  }

  async peekChallenge(challengeId: string) {
    const row = this.mfaChallenges.get(challengeId);
    return row ?? null;
  }

  async consumeChallenge(challengeId: string) {
    const row = this.mfaChallenges.get(challengeId);
    if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) {
      return { outcome: "invalid" as const };
    }
    row.consumedAt = new Date();
    return {
      outcome: "ok" as const,
      userId: row.userId,
      purpose: row.purpose,
      metadata: row.metadata
    };
  }

  async listVerifiedTotpSecrets(userId: string): Promise<readonly string[]> {
    return this.totpSecrets.get(userId) ?? [];
  }

  async tryConsumeRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
    const set = this.recoveryCodeHashes.get(userId);
    if (!set || !set.has(codeHash)) return false;
    set.delete(codeHash);
    return true;
  }

  async enrollTotp(args: {
    readonly userId: string;
    readonly factorId: UuidV7;
    readonly secret: string;
    readonly label?: string | null;
  }): Promise<void> {
    const list = this.totpSecrets.get(args.userId) ?? [];
    list.push(args.secret);
    this.totpSecrets.set(args.userId, list);
    this.mfaUserIds.add(args.userId);
  }

  async replaceRecoveryCodes(userId: string, codeHashes: readonly string[]): Promise<void> {
    this.recoveryCodeHashes.set(userId, new Set(codeHashes));
  }

  async markRecentAuth(sessionId: string, at: Date): Promise<void> {
    this.recentAuthAt.set(sessionId, at);
  }

  async getRecentAuthAt(sessionId: string): Promise<Date | null> {
    return this.recentAuthAt.get(sessionId) ?? null;
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
    return this.withLock(() => {
      const presented = this.refreshByHash.get(args.presentedTokenHash);
      if (
        !presented ||
        presented.revoked ||
        presented.usedAt ||
        presented.expiresAt.getTime() <= Date.now() ||
        this.revokedSessions.has(presented.bootstrap.session.id)
      ) {
        return { outcome: "unauthorized" as const };
      }

      const userId = presented.bootstrap.user.id;
      const tenant = this.tenants.get(args.targetTenantId);
      if (!tenant) {
        return { outcome: "tenant_context_invalid" as const };
      }
      if (tenant.status !== "active") {
        return { outcome: "tenant_inactive" as const };
      }

      const membership = this.memberships.find(
        (m) => m.userId === userId && m.tenantId === args.targetTenantId
      );
      if (!membership) {
        return { outcome: "tenant_context_invalid" as const };
      }
      if (membership.status !== "active") {
        return { outcome: "membership_inactive" as const };
      }

      const user = this.users.get(userId)!;
      const bootstrap: SessionBootstrap = {
        user: {
          id: userId,
          display_name: membership.displayName ?? presented.bootstrap.user.display_name,
          locale: user.locale,
          timezone: tenant.timezone
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          currency: tenant.currency,
          timezone: tenant.timezone
        },
        session: {
          id: presented.bootstrap.session.id,
          version: presented.bootstrap.session.version + 1,
          expires_at: presented.bootstrap.session.expires_at,
          reauth_required_at: presented.bootstrap.session.reauth_required_at
        },
        device: presented.bootstrap.device,
        permissions: [...membership.permissions],
        feature_flags: {}
      };

      for (const row of this.refreshByHash.values()) {
        if (row.bootstrap.session.id === presented.bootstrap.session.id) {
          row.bootstrap = bootstrap;
        }
      }

      return { outcome: "ok" as const, bootstrap };
    });
  }

  async resolveByRefreshTokenHash(tokenHash: string): Promise<SessionBootstrap | null> {
    const row = this.refreshByHash.get(tokenHash);
    if (!row || row.revoked || row.usedAt || row.expiresAt.getTime() <= Date.now()) return null;
    if (this.revokedSessions.has(row.bootstrap.session.id)) return null;
    return row.bootstrap;
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
    return this.withLock(() => {
      const presented = this.refreshByHash.get(args.presentedTokenHash);
      if (!presented) return { outcome: "invalid" as const };
      if (
        presented.revoked ||
        presented.expiresAt.getTime() <= Date.now() ||
        this.revokedSessions.has(presented.bootstrap.session.id)
      ) {
        return { outcome: "invalid" as const };
      }

      if (presented.usedAt != null) {
        const now = new Date();
        for (const row of this.refreshByHash.values()) {
          if (row.familyId === presented.familyId) {
            row.revoked = true;
            row.reuseDetectedAt = now;
          }
        }
        this.revokedSessions.add(presented.bootstrap.session.id);
        return { outcome: "reused" as const };
      }

      presented.usedAt = new Date();
      this.refreshByHash.set(args.newTokenHash, {
        id: args.newRefreshId,
        familyId: presented.familyId,
        parentId: presented.id,
        bootstrap: presented.bootstrap,
        revoked: false,
        expiresAt: args.newExpiresAt,
        usedAt: null,
        reuseDetectedAt: null
      });
      return { outcome: "rotated" as const, bootstrap: presented.bootstrap };
    });
  }

  async logoutCurrentSession(args: {
    readonly presentedTokenHash: string;
    readonly auditId: UuidV7;
    readonly outboxId: UuidV7;
    readonly correlationId: string | null;
    readonly reason: string;
  }): Promise<"revoked" | "already_revoked" | "invalid"> {
    return this.withLock(() => {
      const presented = this.refreshByHash.get(args.presentedTokenHash);
      if (!presented) return "invalid";
      const sessionId = presented.bootstrap.session.id;
      if (this.revokedSessions.has(sessionId) || presented.revoked) {
        return "already_revoked";
      }
      for (const row of this.refreshByHash.values()) {
        if (row.familyId === presented.familyId) {
          row.revoked = true;
        }
      }
      this.revokedSessions.add(sessionId);
      this.outbox.push({
        type: "com.aisales.identity.session-revoked.v1",
        sessionId,
        reason: args.reason
      });
      return "revoked";
    });
  }

  async revokeSessionById(args: {
    readonly actorUserId: string;
    readonly sessionId: string;
    readonly auditId: UuidV7;
    readonly outboxId: UuidV7;
    readonly correlationId: string | null;
  }): Promise<"revoked" | "already_revoked" | "not_found"> {
    return this.withLock(() => {
      const match = [...this.refreshByHash.values()].find(
        (r) => r.bootstrap.session.id === args.sessionId && r.bootstrap.user.id === args.actorUserId
      );
      if (!match) return "not_found";
      if (this.revokedSessions.has(args.sessionId) || match.revoked) {
        return "already_revoked";
      }
      for (const row of this.refreshByHash.values()) {
        if (row.bootstrap.session.id === args.sessionId) {
          row.revoked = true;
        }
      }
      this.revokedSessions.add(args.sessionId);
      this.outbox.push({
        type: "com.aisales.identity.session-revoked.v1",
        sessionId: args.sessionId,
        reason: "session_revoke"
      });
      return "revoked";
    });
  }

  async revokeDeviceById(args: {
    readonly actorUserId: string;
    readonly deviceId: string;
    readonly auditId: UuidV7;
    readonly correlationId: string | null;
  }): Promise<"revoked" | "already_revoked" | "not_found"> {
    return this.withLock(() => {
      const device = this.devices.get(args.deviceId);
      if (!device || device.userId !== args.actorUserId) return "not_found";
      if (device.revokedAt) return "already_revoked";
      device.revokedAt = new Date();
      device.trustStatus = "revoked";
      for (const row of this.refreshByHash.values()) {
        if (row.bootstrap.device.id === args.deviceId && row.bootstrap.user.id === args.actorUserId) {
          row.revoked = true;
          this.revokedSessions.add(row.bootstrap.session.id);
          this.outbox.push({
            type: "com.aisales.identity.session-revoked.v1",
            sessionId: row.bootstrap.session.id,
            reason: "device_revoke"
          });
        }
      }
      return "revoked";
    });
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
    return [...this.devices.values()]
      .filter((d) => d.userId === actorUserId)
      .map((d) => ({
        id: d.id,
        user_id: d.userId,
        platform: d.platform,
        label: d.label,
        trusted: d.trusted,
        trust_status: d.trustStatus,
        created_at: d.createdAt.toISOString(),
        last_seen_at: d.lastSeenAt?.toISOString() ?? null,
        revoked_at: d.revokedAt?.toISOString() ?? null
      }));
  }
}

/** Deterministic token client for unit tests. */
export class MemoryOidcTokenClient implements OidcTokenClient {
  constructor(
    private readonly impl: (args: {
      code: string;
      codeVerifier: string;
      expectedNonceHash: string;
    }) => Promise<OidcIdentityClaims> | OidcIdentityClaims
  ) {}

  exchangeCode(args: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly expectedNonceHash: string;
  }): Promise<OidcIdentityClaims> {
    return Promise.resolve(this.impl(args));
  }
}
