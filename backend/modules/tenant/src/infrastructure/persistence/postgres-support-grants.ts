import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  SupportGrantError,
  type SupportAccessGrant,
  type SupportGrantStore,
  type SupportScope
} from "../../application/support-grant.js";

type GrantRow = {
  id: string;
  tenant_id: string;
  grantee_user_id: string;
  reason: string;
  ticket_ref: string | null;
  scope: SupportScope;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  approved_by: string | null;
};

const SCOPE_RANK: Record<SupportScope, number> = { read: 1, write: 2, admin: 3 };

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toGrant(row: GrantRow): SupportAccessGrant {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    grantee_user_id: row.grantee_user_id,
    reason: row.reason,
    ticket_ref: row.ticket_ref,
    scope: row.scope,
    expires_at: toIso(row.expires_at)!,
    revoked_at: toIso(row.revoked_at),
    created_at: toIso(row.created_at)!,
    approved_by: row.approved_by
  };
}

export class PostgresSupportGrantStore implements SupportGrantStore {
  constructor(private readonly db: AppDatabase) {}

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
    const ctx = adapterSecurityContext(args.tenantId, args.approvedBy ?? undefined);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<GrantRow>`
        insert into app.support_access_grants (
          id, tenant_id, grantee_user_id, reason, ticket_ref, scope,
          approved_by, expires_at, created_by
        ) values (
          ${args.id}::uuid,
          ${args.tenantId}::uuid,
          ${args.granteeUserId}::uuid,
          ${args.reason},
          ${args.ticketRef},
          ${args.scope},
          ${args.approvedBy}::uuid,
          ${args.expiresAt.toISOString()}::timestamptz,
          ${args.approvedBy}::uuid
        )
        returning
          id, tenant_id, grantee_user_id, reason, ticket_ref, scope,
          expires_at, revoked_at, created_at, approved_by
      `.execute(trx);

      const actorId = args.approvedBy ?? args.granteeUserId;
      await sql`
        insert into app.audit_events (
          id, tenant_id, action, actor_id, correlation_id, payload
        ) values (
          ${generateUuidV7()}::uuid,
          ${args.tenantId}::uuid,
          'support.grant.create',
          ${actorId}::uuid,
          'support-grant',
          ${JSON.stringify({
            grant_id: args.id,
            grantee_user_id: args.granteeUserId,
            scope: args.scope
          })}::jsonb
        )
      `.execute(trx);

      return toGrant(result.rows[0]!);
    });
  }

  async get(id: string): Promise<SupportAccessGrant | null> {
    const result = await sql<GrantRow>`
      select
        id, tenant_id, grantee_user_id, reason, ticket_ref, scope,
        expires_at, revoked_at, created_at, approved_by
      from app.support_grant_get(${id}::uuid)
    `.execute(this.db);
    const row = result.rows[0];
    return row ? toGrant(row) : null;
  }

  async revoke(id: string, now: Date): Promise<SupportAccessGrant> {
    // Prefer assertUsable/create paths; revoke without tenant is best-effort.
    const existing = await this.get(id);
    if (!existing) throw new SupportGrantError("Grant not found.", "RESOURCE_NOT_FOUND");
    const ctx = adapterSecurityContext(existing.tenant_id);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<GrantRow>`
        update app.support_access_grants
        set revoked_at = ${now.toISOString()}::timestamptz
        where id = ${id}::uuid
        returning
          id, tenant_id, grantee_user_id, reason, ticket_ref, scope,
          expires_at, revoked_at, created_at, approved_by
      `.execute(trx);
      const row = result.rows[0];
      if (!row) throw new SupportGrantError("Grant not found.", "RESOURCE_NOT_FOUND");
      const actorId = row.approved_by ?? row.grantee_user_id;
      await sql`
        insert into app.audit_events (
          id, tenant_id, action, actor_id, correlation_id, payload
        ) values (
          gen_random_uuid(),
          ${row.tenant_id}::uuid,
          'support.grant.revoke',
          ${actorId}::uuid,
          'support-grant',
          ${JSON.stringify({ grant_id: row.id })}::jsonb
        )
      `.execute(trx);
      return toGrant(row);
    });
  }

  async assertUsable(args: {
    readonly grantId: string;
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly requiredScope: SupportScope;
    readonly now?: Date;
  }): Promise<SupportAccessGrant> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorUserId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<GrantRow>`
        select
          id, tenant_id, grantee_user_id, reason, ticket_ref, scope,
          expires_at, revoked_at, created_at, approved_by
        from app.support_access_grants
        where id = ${args.grantId}::uuid
          and tenant_id = ${args.tenantId}::uuid
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      if (!row || row.grantee_user_id !== args.actorUserId) {
        throw new SupportGrantError("Grant not found.", "RESOURCE_NOT_FOUND");
      }
      const now = args.now ?? new Date();
      if (row.revoked_at) {
        throw new SupportGrantError("Grant revoked.", "SUPPORT_GRANT_REVOKED");
      }
      if (row.expires_at.getTime() <= now.getTime()) {
        throw new SupportGrantError("Grant expired.", "SUPPORT_GRANT_EXPIRED");
      }
      if (SCOPE_RANK[row.scope] < SCOPE_RANK[args.requiredScope]) {
        throw new SupportGrantError("Scope insufficient.", "SUPPORT_SCOPE_DENIED");
      }
      await sql`
        insert into app.audit_events (
          id, tenant_id, action, actor_id, correlation_id, payload
        ) values (
          gen_random_uuid(),
          ${args.tenantId}::uuid,
          'support.grant.use',
          ${args.actorUserId}::uuid,
          'support-grant',
          ${JSON.stringify({ grant_id: row.id, scope: args.requiredScope })}::jsonb
        )
      `.execute(trx);
      return toGrant(row);
    });
  }
}
