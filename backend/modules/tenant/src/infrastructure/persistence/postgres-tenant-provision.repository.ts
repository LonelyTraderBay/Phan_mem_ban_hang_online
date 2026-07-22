import { sql } from "kysely";
import type { RequestSecurityContext } from "@ai-sales/auth-context";
import type { AppDatabase } from "@ai-sales/database";
import { withTenantTransaction } from "@ai-sales/database";
import type { UuidV7 } from "@ai-sales/domain-kernel";
import {
  TenantProvisionError,
  type SystemRoleTemplate,
  type TenantProvisionRepository
} from "../../application/provision-tenant.js";

export class PostgresTenantProvisionRepository implements TenantProvisionRepository {
  constructor(private readonly db: AppDatabase) {}

  async findTenantIdByCode(_code: string): Promise<string | null> {
    // Global unique lookup is not visible under tenant RLS; conflicts are detected on insert.
    return null;
  }

  async listSystemRoleTemplates(): Promise<SystemRoleTemplate[]> {
    return this.db.transaction().execute(async (trx) => {
      await sql`select set_config('app.tenant_id', '', true)`.execute(trx);
      await sql`select set_config('app.actor_id', '', true)`.execute(trx);
      const roles = await sql<{
        id: string;
        name: string;
        description: string | null;
      }>`
        select id::text, name, description
        from app.roles
        where tenant_id is null and is_system = true
        order by name
      `.execute(trx);

      const out: SystemRoleTemplate[] = [];
      for (const role of roles.rows) {
        if (
          role.name !== "Owner" &&
          role.name !== "Admin" &&
          role.name !== "Staff" &&
          role.name !== "ReadOnly"
        ) {
          continue;
        }
        const perms = await sql<{ permission_key: string }>`
          select permission_key from app.role_permissions where role_id = ${role.id}::uuid
        `.execute(trx);
        out.push({
          id: role.id,
          name: role.name,
          description: role.description,
          permissionKeys: perms.rows.map((p) => p.permission_key)
        });
      }
      return out;
    });
  }

  async provisionInTenantContext(
    ctx: RequestSecurityContext,
    args: {
      readonly tenant: {
        readonly id: UuidV7;
        readonly code: string;
        readonly name: string;
        readonly timezone: string;
        readonly currency: string;
        readonly locale: string;
        readonly planId: string;
      };
      readonly roles: ReadonlyArray<{
        readonly id: UuidV7;
        readonly name: string;
        readonly description: string | null;
        readonly permissionKeys: readonly string[];
      }>;
      readonly invitation: {
        readonly id: UuidV7;
        readonly email: string;
        readonly tokenHash: string;
        readonly roleIds: readonly string[];
        readonly expiresAt: Date;
      };
      readonly auditId: UuidV7;
      readonly outboxId: UuidV7;
    }
  ): Promise<{ readonly createdAt: Date; readonly updatedAt: Date }> {
    try {
      return await withTenantTransaction(this.db, ctx, async (trx) => {
        const inserted = await sql<{ created_at: Date; updated_at: Date }>`
          insert into app.tenants (
            id, code, name, status, timezone, currency, locale, plan_id
          ) values (
            ${args.tenant.id}::uuid,
            ${args.tenant.code},
            ${args.tenant.name},
            'active',
            ${args.tenant.timezone},
            ${args.tenant.currency},
            ${args.tenant.locale},
            ${args.tenant.planId}
          )
          returning created_at, updated_at
        `.execute(trx);

        for (const role of args.roles) {
          await sql`
            insert into app.roles (
              id, tenant_id, name, description, is_system
            ) values (
              ${role.id}::uuid,
              ${ctx.tenantId}::uuid,
              ${role.name},
              ${role.description},
              false
            )
          `.execute(trx);

          for (const key of role.permissionKeys) {
            await sql`
              insert into app.role_permissions (role_id, permission_key)
              values (${role.id}::uuid, ${key})
              on conflict do nothing
            `.execute(trx);
          }
        }

        await sql`
          insert into app.invitations (
            id, tenant_id, email, token_hash, status, role_ids, invited_by, expires_at
          ) values (
            ${args.invitation.id}::uuid,
            ${ctx.tenantId}::uuid,
            ${args.invitation.email},
            ${args.invitation.tokenHash},
            'pending',
            ${args.invitation.roleIds}::uuid[],
            null,
            ${args.invitation.expiresAt.toISOString()}::timestamptz
          )
        `.execute(trx);

        await sql`
          insert into app.audit_events (
            id, tenant_id, action, actor_id, correlation_id, payload
          ) values (
            ${args.auditId}::uuid,
            ${ctx.tenantId}::uuid,
            'tenant.provision',
            ${ctx.actorId}::uuid,
            ${ctx.correlationId},
            ${JSON.stringify({ code: args.tenant.code, plan_id: args.tenant.planId })}::jsonb
          )
        `.execute(trx);

        await sql`
          insert into app.outbox_events (
            id, tenant_id, event_type, aggregate_type, aggregate_id, payload, correlation_id
          ) values (
            ${args.outboxId}::uuid,
            ${ctx.tenantId}::uuid,
            'com.aisales.tenant.activated.v1',
            'tenant',
            ${args.tenant.id}::uuid,
            ${JSON.stringify({
              tenant_id: args.tenant.id,
              plan_id: args.tenant.planId
            })}::jsonb,
            ${ctx.correlationId}
          )
        `.execute(trx);

        const stamp = inserted.rows[0]!;
        return { createdAt: stamp.created_at, updatedAt: stamp.updated_at };
      });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
      if (code === "23505") {
        throw new TenantProvisionError("Tenant code already exists.", "CONFLICT");
      }
      throw error;
    }
  }
}
