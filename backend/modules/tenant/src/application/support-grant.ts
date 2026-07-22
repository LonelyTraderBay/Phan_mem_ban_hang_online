import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";

export type SupportScope = "read" | "write" | "admin";

export class SupportGrantError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INSUFFICIENT_PERMISSION"
      | "VALIDATION_FAILED"
      | "SUPPORT_GRANT_EXPIRED"
      | "SUPPORT_GRANT_REVOKED"
      | "SUPPORT_SCOPE_DENIED"
      | "RESOURCE_NOT_FOUND"
  ) {
    super(message);
    this.name = "SupportGrantError";
  }
}

export interface SupportAccessGrant {
  readonly id: string;
  readonly tenant_id: string;
  readonly grantee_user_id: string;
  readonly reason: string;
  readonly ticket_ref: string | null;
  readonly scope: SupportScope;
  readonly expires_at: string;
  readonly revoked_at: string | null;
  readonly created_at: string;
  readonly approved_by: string | null;
}

export interface SupportGrantStore {
  create(args: {
    readonly id: UuidV7;
    readonly tenantId: string;
    readonly granteeUserId: string;
    readonly reason: string;
    readonly ticketRef: string | null;
    readonly scope: SupportScope;
    readonly expiresAt: Date;
    readonly approvedBy: string | null;
  }): Promise<SupportAccessGrant>;

  get(id: string): Promise<SupportAccessGrant | null>;

  revoke(id: string, now: Date): Promise<SupportAccessGrant>;

  /**
   * Resolve grant for use. Audits successful use via onUse callback payload.
   */
  assertUsable(args: {
    readonly grantId: string;
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly requiredScope: SupportScope;
    readonly now?: Date;
  }): Promise<SupportAccessGrant>;
}

const SCOPE_RANK: Record<SupportScope, number> = { read: 1, write: 2, admin: 3 };

export class InMemorySupportGrantStore implements SupportGrantStore {
  readonly grants = new Map<
    string,
    {
      id: string;
      tenant_id: string;
      grantee_user_id: string;
      reason: string;
      ticket_ref: string | null;
      scope: SupportScope;
      expires_at: string;
      revoked_at: string | null;
      created_at: string;
      approved_by: string | null;
      _uses: number;
    }
  >();
  readonly auditTrail: Array<{ action: string; grant_id: string; actor_id: string; tenant_id: string }> =
    [];

  async create(args: {
    readonly id: UuidV7;
    readonly tenantId: string;
    readonly granteeUserId: string;
    readonly reason: string;
    readonly ticketRef: string | null;
    readonly scope: SupportScope;
    readonly expiresAt: Date;
    readonly approvedBy: string | null;
  }): Promise<SupportAccessGrant> {
    const now = new Date();
    const grant = {
      id: args.id,
      tenant_id: args.tenantId,
      grantee_user_id: args.granteeUserId,
      reason: args.reason,
      ticket_ref: args.ticketRef,
      scope: args.scope,
      expires_at: args.expiresAt.toISOString(),
      revoked_at: null as string | null,
      created_at: now.toISOString(),
      approved_by: args.approvedBy,
      _uses: 0
    };
    this.grants.set(grant.id, grant);
    this.auditTrail.push({
      action: "support.grant.create",
      grant_id: grant.id,
      actor_id: args.approvedBy ?? args.granteeUserId,
      tenant_id: args.tenantId
    });
    const { _uses: _, ...publicGrant } = grant;
    return publicGrant;
  }

  async get(id: string): Promise<SupportAccessGrant | null> {
    const g = this.grants.get(id);
    if (!g) return null;
    const { _uses: _, ...publicGrant } = g;
    return publicGrant;
  }

  async revoke(id: string, now: Date): Promise<SupportAccessGrant> {
    const g = this.grants.get(id);
    if (!g) throw new SupportGrantError("Grant not found.", "RESOURCE_NOT_FOUND");
    g.revoked_at = now.toISOString();
    this.auditTrail.push({
      action: "support.grant.revoke",
      grant_id: g.id,
      actor_id: g.approved_by ?? g.grantee_user_id,
      tenant_id: g.tenant_id
    });
    const { _uses: _, ...publicGrant } = g;
    return publicGrant;
  }

  async assertUsable(args: {
    readonly grantId: string;
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly requiredScope: SupportScope;
    readonly now?: Date;
  }): Promise<SupportAccessGrant> {
    const g = this.grants.get(args.grantId);
    if (!g || g.tenant_id !== args.tenantId) {
      throw new SupportGrantError("Grant not found.", "RESOURCE_NOT_FOUND");
    }
    if (g.grantee_user_id !== args.actorUserId) {
      throw new SupportGrantError("Grant not found.", "RESOURCE_NOT_FOUND");
    }
    const now = args.now ?? new Date();
    if (g.revoked_at) {
      throw new SupportGrantError("Grant revoked.", "SUPPORT_GRANT_REVOKED");
    }
    if (new Date(g.expires_at).getTime() <= now.getTime()) {
      throw new SupportGrantError("Grant expired.", "SUPPORT_GRANT_EXPIRED");
    }
    if (SCOPE_RANK[g.scope] < SCOPE_RANK[args.requiredScope]) {
      throw new SupportGrantError("Scope insufficient.", "SUPPORT_SCOPE_DENIED");
    }
    g._uses += 1;
    this.auditTrail.push({
      action: "support.grant.use",
      grant_id: g.id,
      actor_id: args.actorUserId,
      tenant_id: args.tenantId
    });
    const { _uses: _, ...publicGrant } = g;
    return publicGrant;
  }
}

export async function createSupportAccess(options: {
  readonly store: SupportGrantStore;
  readonly actorPermissions: readonly string[];
  readonly actorUserId: string;
  readonly tenantId: string;
  readonly granteeUserId: string;
  readonly expiresAt: string;
  readonly reason?: string;
  readonly ticketRef?: string | null;
  readonly scope?: SupportScope;
}): Promise<{
  readonly data: {
    readonly id: string;
    readonly status: string;
    readonly tenant_id: string;
    readonly created_at: string;
    readonly detail: SupportAccessGrant;
  };
  readonly meta: Record<string, never>;
}> {
  if (!options.actorPermissions.includes("support.access")) {
    throw new SupportGrantError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
  const reason = (options.reason ?? "").trim();
  if (!reason) {
    throw new SupportGrantError("reason is required.", "VALIDATION_FAILED");
  }
  const expiresAt = new Date(options.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new SupportGrantError("expires_at must be in the future.", "VALIDATION_FAILED");
  }
  const grant = await options.store.create({
    id: generateUuidV7(),
    tenantId: options.tenantId,
    granteeUserId: options.granteeUserId,
    reason,
    ticketRef: options.ticketRef ?? null,
    scope: options.scope ?? "read",
    expiresAt,
    approvedBy: options.actorUserId
  });
  return {
    data: {
      id: grant.id,
      status: "active",
      tenant_id: grant.tenant_id,
      created_at: grant.created_at,
      detail: grant
    },
    meta: {}
  };
}
