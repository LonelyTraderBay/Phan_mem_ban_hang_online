import type { RequestSecurityContext } from "@ai-sales/auth-context";
import type { UuidV7 } from "@ai-sales/domain-kernel";
import {
  SYSTEM_ROLE_IDS,
  type SystemRoleTemplate,
  type TenantProvisionRepository
} from "../../application/provision-tenant.js";

/** In-memory repo for unit tests (no Postgres). */
export class InMemoryTenantProvisionRepository implements TenantProvisionRepository {
  readonly tenants = new Map<string, { code: string; name: string; planId: string }>();
  readonly invitations: Array<{ id: string; tenantId: string; email: string; roleIds: string[] }> = [];
  readonly roles: Array<{ id: string; tenantId: string; name: string; permissions: string[] }> = [];
  readonly audits: Array<{ action: string; tenantId: string }> = [];
  readonly outbox: Array<{ type: string; tenantId: string }> = [];

  private templates: SystemRoleTemplate[] = [
    {
      id: SYSTEM_ROLE_IDS.Owner,
      name: "Owner",
      description: "System template: full tenant owner",
      permissionKeys: ["tenant.read", "tenant.update", "member.invite"]
    },
    {
      id: SYSTEM_ROLE_IDS.Admin,
      name: "Admin",
      description: "System template: tenant administrator",
      permissionKeys: ["tenant.read", "member.read"]
    },
    {
      id: SYSTEM_ROLE_IDS.Staff,
      name: "Staff",
      description: "System template: operational staff",
      permissionKeys: ["tenant.read", "order.read"]
    },
    {
      id: SYSTEM_ROLE_IDS.ReadOnly,
      name: "ReadOnly",
      description: "System template: analyst",
      permissionKeys: ["tenant.read", "report.read"]
    }
  ];

  async findTenantIdByCode(code: string): Promise<string | null> {
    for (const [id, t] of this.tenants) {
      if (t.code === code) return id;
    }
    return null;
  }

  async listSystemRoleTemplates(): Promise<SystemRoleTemplate[]> {
    return this.templates;
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
    const now = new Date();
    this.tenants.set(args.tenant.id, {
      code: args.tenant.code,
      name: args.tenant.name,
      planId: args.tenant.planId
    });
    for (const role of args.roles) {
      this.roles.push({
        id: role.id,
        tenantId: ctx.tenantId,
        name: role.name,
        permissions: [...role.permissionKeys]
      });
    }
    this.invitations.push({
      id: args.invitation.id,
      tenantId: ctx.tenantId,
      email: args.invitation.email,
      roleIds: [...args.invitation.roleIds]
    });
    this.audits.push({ action: "tenant.provision", tenantId: ctx.tenantId });
    this.outbox.push({ type: "com.aisales.tenant.activated.v1", tenantId: ctx.tenantId });
    return { createdAt: now, updatedAt: now };
  }
}
