import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  MembersRolesError,
  type MemberResource,
  type MembersRolesRepository,
  type RoleResource
} from "../../application/members.js";

type MemberRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  email: string;
  display_name: string | null;
  status: MemberResource["status"];
  version: number | string;
  created_at: Date;
  updated_at: Date;
  role_ids: string[] | null;
};

type RoleRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  version: number | string;
  created_at: Date;
  updated_at: Date;
  permissions: string[] | null;
  is_owner: boolean;
  is_admin: boolean;
  archived: boolean;
};

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toMember(row: MemberRow): MemberResource {
  return {
    id: row.id,
    user_id: row.user_id,
    tenant_id: row.tenant_id,
    email: row.email,
    display_name: row.display_name,
    status: row.status,
    role_ids: [...(row.role_ids ?? [])],
    version: Number(row.version),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

function toRole(row: RoleRow): RoleResource {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    description: row.description,
    permissions: [...(row.permissions ?? [])].sort(),
    version: Number(row.version),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

/**
 * Postgres members/roles adapter.
 * Invite/accept use SECURITY DEFINER helpers from migration 000026
 * (cross-user INSERT + token lookup bypass TENANT_OWNED / users self RLS).
 */
export class PostgresMembersRolesRepository implements MembersRolesRepository {
  private readonly permissionCacheGeneration = new Map<string, number>();

  constructor(private readonly db: AppDatabase) {}

  getPermissionCacheGeneration(tenantId: string): number {
    return this.permissionCacheGeneration.get(tenantId) ?? 0;
  }

  private bumpCache(tenantId: string): void {
    this.permissionCacheGeneration.set(
      tenantId,
      (this.permissionCacheGeneration.get(tenantId) ?? 0) + 1
    );
  }

  private async loadMember(tenantId: string, memberId: string): Promise<MemberResource | null> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<MemberRow>`
        select
          tm.id,
          tm.user_id,
          tm.tenant_id,
          u.primary_email::text as email,
          tm.display_name,
          tm.status,
          tm.version,
          tm.created_at,
          tm.updated_at,
          coalesce(
            (
              select array_agg(mr.role_id::text order by mr.role_id)
              from app.membership_roles mr
              where mr.membership_id = tm.id and mr.tenant_id = tm.tenant_id
            ),
            '{}'::text[]
          ) as role_ids
        from app.tenant_memberships tm
        join app.users u on u.id = tm.user_id
        where tm.tenant_id = ${tenantId}::uuid
          and tm.id = ${memberId}::uuid
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      return row ? toMember(row) : null;
    });
  }

  private async countOwners(
    tenantId: string,
    excludingMemberId?: string
  ): Promise<number> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{ n: string }>`
        select count(*)::text as n
        from app.tenant_memberships tm
        where tm.tenant_id = ${tenantId}::uuid
          and tm.status = 'active'
          and (${excludingMemberId}::uuid is null or tm.id <> ${excludingMemberId}::uuid)
          and exists (
            select 1
            from app.membership_roles mr
            join app.roles r on r.id = mr.role_id
            where mr.membership_id = tm.id
              and mr.tenant_id = tm.tenant_id
              and lower(r.name) = 'owner'
              and coalesce(r.metadata->>'archived', 'false') <> 'true'
          )
      `.execute(trx);
      return Number(result.rows[0]?.n ?? 0);
    });
  }

  private async countAdmins(
    tenantId: string,
    excludingMemberId: string,
    nextRoleIds: readonly string[]
  ): Promise<number> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const others = await sql<{ n: string }>`
        select count(*)::text as n
        from app.tenant_memberships tm
        where tm.tenant_id = ${tenantId}::uuid
          and tm.status = 'active'
          and tm.id <> ${excludingMemberId}::uuid
          and exists (
            select 1
            from app.membership_roles mr
            join app.roles r on r.id = mr.role_id
            left join app.role_permissions rp on rp.role_id = r.id
            where mr.membership_id = tm.id
              and mr.tenant_id = tm.tenant_id
              and (
                lower(r.name) in ('owner', 'admin')
                or rp.permission_key = 'role.manage'
              )
          )
      `.execute(trx);
      const nextIsAdmin = await sql<{ ok: boolean }>`
        select exists (
          select 1 from app.roles r
          left join app.role_permissions rp on rp.role_id = r.id
          where r.id = any(${[...nextRoleIds]}::uuid[])
            and r.tenant_id = ${tenantId}::uuid
            and (
              lower(r.name) in ('owner', 'admin')
              or rp.permission_key = 'role.manage'
            )
        ) as ok
      `.execute(trx);
      return Number(others.rows[0]?.n ?? 0) + (nextIsAdmin.rows[0]?.ok ? 1 : 0);
    });
  }

  async inviteMember(args: {
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly email: string;
    readonly displayName: string | null;
    readonly roleIds: readonly string[];
    readonly invitationId: UuidV7;
    readonly membershipId: UuidV7;
    readonly userId: UuidV7;
    readonly tokenHash: string;
    readonly expiresAt: Date;
  }): Promise<MemberResource> {
    const result = await sql<{
      out_membership_id: string;
      out_user_id: string;
      out_email: string;
      out_display_name: string | null;
      out_status: MemberResource["status"];
      out_role_ids: string[];
      out_version: number | string;
      out_created_at: Date;
      out_updated_at: Date;
      error_code: string | null;
    }>`
      select * from app.invite_member(
        ${args.tenantId}::uuid,
        ${args.actorUserId}::uuid,
        ${args.email},
        ${args.displayName},
        ${[...args.roleIds]}::uuid[],
        ${args.invitationId}::uuid,
        ${args.membershipId}::uuid,
        ${args.userId}::uuid,
        ${args.tokenHash},
        ${args.expiresAt.toISOString()}::timestamptz
      )
    `.execute(this.db);

    const row = result.rows[0];
    if (!row) {
      throw new MembersRolesError("Invite failed.", "VALIDATION_FAILED");
    }
    if (row.error_code === "CONFLICT") {
      throw new MembersRolesError("Member or invitation conflict.", "CONFLICT");
    }
    if (row.error_code) {
      throw new MembersRolesError("Unknown role_id.", "VALIDATION_FAILED");
    }
    this.bumpCache(args.tenantId);
    return {
      id: row.out_membership_id,
      user_id: row.out_user_id,
      tenant_id: args.tenantId,
      email: row.out_email,
      display_name: row.out_display_name,
      status: row.out_status,
      role_ids: [...(row.out_role_ids ?? [])],
      version: Number(row.out_version),
      created_at: toIso(row.out_created_at),
      updated_at: toIso(row.out_updated_at)
    };
  }

  async listMembers(tenantId: string): Promise<readonly MemberResource[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<MemberRow>`
        select
          tm.id,
          tm.user_id,
          tm.tenant_id,
          u.primary_email::text as email,
          tm.display_name,
          tm.status,
          tm.version,
          tm.created_at,
          tm.updated_at,
          coalesce(
            (
              select array_agg(mr.role_id::text order by mr.role_id)
              from app.membership_roles mr
              where mr.membership_id = tm.id and mr.tenant_id = tm.tenant_id
            ),
            '{}'::text[]
          ) as role_ids
        from app.tenant_memberships tm
        join app.users u on u.id = tm.user_id
        where tm.tenant_id = ${tenantId}::uuid
        order by tm.created_at
      `.execute(trx);
      return result.rows.map(toMember);
    });
  }

  async suspendMember(args: {
    readonly tenantId: string;
    readonly memberId: string;
  }): Promise<MemberResource> {
    const member = await this.loadMember(args.tenantId, args.memberId);
    if (!member) throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    if (member.status === "invited") {
      throw new MembersRolesError("Cannot suspend invited member.", "VALIDATION_FAILED");
    }
    const memberIsOwner = await this.memberHasOwnerRole(args.tenantId, member.id);
    if (memberIsOwner) {
      const ownersLeft = await this.countOwners(args.tenantId, member.id);
      if (ownersLeft === 0) {
        throw new MembersRolesError("Cannot suspend last owner.", "USER_LAST_OWNER");
      }
    }

    const ctx = adapterSecurityContext(args.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        update app.tenant_memberships
        set status = 'suspended', version = version + 1, updated_at = now()
        where id = ${args.memberId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      await sql`
        update app.tenants
        set permission_version = permission_version + 1, updated_at = now()
        where id = ${args.tenantId}::uuid
      `.execute(trx);
    });
    this.bumpCache(args.tenantId);
    const updated = await this.loadMember(args.tenantId, args.memberId);
    if (!updated) throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    return updated;
  }

  private async memberHasOwnerRole(tenantId: string, memberId: string): Promise<boolean> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{ ok: boolean }>`
        select exists (
          select 1
          from app.membership_roles mr
          join app.roles r on r.id = mr.role_id
          where mr.membership_id = ${memberId}::uuid
            and mr.tenant_id = ${tenantId}::uuid
            and lower(r.name) = 'owner'
        ) as ok
      `.execute(trx);
      return Boolean(result.rows[0]?.ok);
    });
  }

  private async memberHasAdminRole(tenantId: string, memberId: string): Promise<boolean> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{ ok: boolean }>`
        select exists (
          select 1
          from app.membership_roles mr
          join app.roles r on r.id = mr.role_id
          left join app.role_permissions rp on rp.role_id = r.id
          where mr.membership_id = ${memberId}::uuid
            and mr.tenant_id = ${tenantId}::uuid
            and (
              lower(r.name) in ('owner', 'admin')
              or rp.permission_key = 'role.manage'
            )
        ) as ok
      `.execute(trx);
      return Boolean(result.rows[0]?.ok);
    });
  }

  async activateMember(args: {
    readonly tenantId: string;
    readonly memberId: string;
  }): Promise<MemberResource> {
    const member = await this.loadMember(args.tenantId, args.memberId);
    if (!member) throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    if (member.status !== "suspended") {
      throw new MembersRolesError("Member is not suspended.", "VALIDATION_FAILED");
    }
    const ctx = adapterSecurityContext(args.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        update app.tenant_memberships
        set status = 'active', version = version + 1, updated_at = now()
        where id = ${args.memberId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      await sql`
        update app.tenants
        set permission_version = permission_version + 1, updated_at = now()
        where id = ${args.tenantId}::uuid
      `.execute(trx);
    });
    this.bumpCache(args.tenantId);
    const updated = await this.loadMember(args.tenantId, args.memberId);
    if (!updated) throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    return updated;
  }

  async revokeMember(args: {
    readonly tenantId: string;
    readonly memberId: string;
  }): Promise<MemberResource> {
    const member = await this.loadMember(args.tenantId, args.memberId);
    if (!member) throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    const memberIsOwner = await this.memberHasOwnerRole(args.tenantId, args.memberId);
    if (member.status === "active" && memberIsOwner) {
      const ownersLeft = await this.countOwners(args.tenantId, member.id);
      if (ownersLeft === 0) {
        throw new MembersRolesError("Cannot revoke last owner.", "USER_LAST_OWNER");
      }
    }

    const ctx = adapterSecurityContext(args.tenantId, args.memberId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        update app.invitations i
        set status = 'revoked', revoked_at = now(), updated_at = now()
        where i.tenant_id = ${args.tenantId}::uuid
          and i.status = 'pending'
          and (
            i.metadata->>'membership_id' = ${args.memberId}
            or i.email = ${member.email}::citext
          )
      `.execute(trx);
      await sql`
        update app.tenant_memberships
        set status = 'revoked', revoked_at = now(), version = version + 1, updated_at = now()
        where id = ${args.memberId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      await sql`
        update app.tenants
        set permission_version = permission_version + 1, updated_at = now()
        where id = ${args.tenantId}::uuid
      `.execute(trx);
    });
    this.bumpCache(args.tenantId);
    const updated = await this.loadMember(args.tenantId, args.memberId);
    if (!updated) throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    return updated;
  }

  async resendInvitation(args: {
    readonly tenantId: string;
    readonly invitationId: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
  }): Promise<MemberResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    const membershipId = await withTenantTransaction(this.db, ctx, async (trx) => {
      const inv = await sql<{
        status: string;
        membership_id: string | null;
        email: string;
      }>`
        select
          status,
          metadata->>'membership_id' as membership_id,
          email::text as email
        from app.invitations
        where id = ${args.invitationId}::uuid
          and tenant_id = ${args.tenantId}::uuid
        limit 1
      `.execute(trx);
      const row = inv.rows[0];
      if (!row) throw new MembersRolesError("Invitation not found.", "RESOURCE_NOT_FOUND");
      if (row.status !== "pending") {
        throw new MembersRolesError("Invitation is not pending.", "VALIDATION_FAILED");
      }
      await sql`
        update app.invitations
        set token_hash = ${args.tokenHash},
            expires_at = ${args.expiresAt.toISOString()}::timestamptz,
            updated_at = now()
        where id = ${args.invitationId}::uuid
          and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      if (row.membership_id) {
        await sql`
          update app.tenant_memberships
          set version = version + 1, updated_at = now()
          where id = ${row.membership_id}::uuid
            and tenant_id = ${args.tenantId}::uuid
        `.execute(trx);
        return row.membership_id;
      }
      const byEmail = await sql<{ id: string }>`
        select tm.id
        from app.tenant_memberships tm
        join app.users u on u.id = tm.user_id
        where tm.tenant_id = ${args.tenantId}::uuid
          and u.primary_email = ${row.email}::citext
          and tm.status = 'invited'
        limit 1
      `.execute(trx);
      if (!byEmail.rows[0]) {
        throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
      }
      return byEmail.rows[0].id;
    });
    const member = await this.loadMember(args.tenantId, membershipId);
    if (!member) throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    return member;
  }

  async acceptInvitation(args: {
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
  > {
    const result = await sql<{
      outcome: string;
      tenant_id: string | null;
      user_id: string | null;
      membership_id: string | null;
      email: string | null;
      display_name: string | null;
      role_ids: string[] | null;
      permissions: string[] | null;
    }>`
      select * from app.accept_invitation(
        ${args.tokenHash},
        ${args.passwordHash},
        ${args.now.toISOString()}::timestamptz
      )
    `.execute(this.db);

    const row = result.rows[0];
    if (!row) return { outcome: "INVITATION_TOKEN_INVALID" };
    if (row.outcome !== "ok") {
      return {
        outcome: row.outcome as
          | "INVITE_EXPIRED"
          | "INVITE_REVOKED"
          | "INVITE_ALREADY_ACCEPTED"
          | "INVITATION_TOKEN_INVALID"
      };
    }
    if (row.tenant_id) this.bumpCache(row.tenant_id);
    return {
      outcome: "ok",
      tenantId: row.tenant_id!,
      userId: row.user_id!,
      membershipId: row.membership_id!,
      email: row.email!,
      displayName: row.display_name,
      roleIds: [...(row.role_ids ?? [])],
      permissions: [...(row.permissions ?? [])]
    };
  }

  async listRoles(tenantId: string): Promise<readonly RoleResource[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<RoleRow>`
        select
          r.id,
          r.tenant_id,
          r.name,
          r.description,
          r.version,
          r.created_at,
          r.updated_at,
          coalesce(
            (
              select array_agg(rp.permission_key order by rp.permission_key)
              from app.role_permissions rp
              where rp.role_id = r.id
            ),
            '{}'::text[]
          ) as permissions,
          lower(r.name) = 'owner' as is_owner,
          (
            lower(r.name) in ('owner', 'admin')
            or exists (
              select 1 from app.role_permissions rp
              where rp.role_id = r.id and rp.permission_key = 'role.manage'
            )
          ) as is_admin,
          coalesce(r.metadata->>'archived', 'false') = 'true' as archived
        from app.roles r
        where r.tenant_id = ${tenantId}::uuid
          and coalesce(r.metadata->>'archived', 'false') <> 'true'
        order by r.name
      `.execute(trx);
      return result.rows.map(toRole);
    });
  }

  async listPermissionKeys(): Promise<readonly string[]> {
    const result = await sql<{ key: string }>`
      select key from app.permissions order by key
    `.execute(this.db);
    return result.rows.map((r) => r.key);
  }

  async createRole(args: {
    readonly tenantId: string;
    readonly roleId: UuidV7;
    readonly name: string;
    readonly description: string | null;
    readonly permissions: readonly string[];
  }): Promise<RoleResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    try {
      await withTenantTransaction(this.db, ctx, async (trx) => {
        await sql`
          insert into app.roles (id, tenant_id, name, description, is_system)
          values (
            ${args.roleId}::uuid,
            ${args.tenantId}::uuid,
            ${args.name},
            ${args.description},
            false
          )
        `.execute(trx);
        for (const key of args.permissions) {
          await sql`
            insert into app.role_permissions (role_id, permission_key)
            values (${args.roleId}::uuid, ${key})
            on conflict do nothing
          `.execute(trx);
        }
        await sql`
          update app.tenants
          set permission_version = permission_version + 1, updated_at = now()
          where id = ${args.tenantId}::uuid
        `.execute(trx);
      });
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code: string }).code)
          : "";
      if (code === "23505") {
        throw new MembersRolesError("Role name conflict.", "CONFLICT");
      }
      throw error;
    }
    this.bumpCache(args.tenantId);
    const roles = await this.listRoles(args.tenantId);
    const created = roles.find((r) => r.id === args.roleId);
    if (!created) throw new MembersRolesError("Role not found.", "RESOURCE_NOT_FOUND");
    return created;
  }

  async updateRole(args: {
    readonly tenantId: string;
    readonly roleId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
    readonly description: string | null | undefined;
    readonly permissions: readonly string[] | null | undefined;
  }): Promise<RoleResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await sql<{ version: string; archived: boolean }>`
        select version::text,
               coalesce(metadata->>'archived', 'false') = 'true' as archived
        from app.roles
        where id = ${args.roleId}::uuid
          and tenant_id = ${args.tenantId}::uuid
        limit 1
      `.execute(trx);
      const row = current.rows[0];
      if (!row || row.archived) {
        throw new MembersRolesError("Role not found.", "RESOURCE_NOT_FOUND");
      }
      if (Number(row.version) !== args.expectedVersion) {
        throw new MembersRolesError("Role version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      const nextName = args.name ?? null;
      const nextDescription =
        args.description !== undefined ? args.description : undefined;
      if (nextName != null && nextDescription !== undefined) {
        await sql`
          update app.roles
          set name = ${nextName},
              description = ${nextDescription},
              version = version + 1,
              updated_at = now()
          where id = ${args.roleId}::uuid
            and tenant_id = ${args.tenantId}::uuid
        `.execute(trx);
      } else if (nextName != null) {
        await sql`
          update app.roles
          set name = ${nextName},
              version = version + 1,
              updated_at = now()
          where id = ${args.roleId}::uuid
            and tenant_id = ${args.tenantId}::uuid
        `.execute(trx);
      } else if (nextDescription !== undefined) {
        await sql`
          update app.roles
          set description = ${nextDescription},
              version = version + 1,
              updated_at = now()
          where id = ${args.roleId}::uuid
            and tenant_id = ${args.tenantId}::uuid
        `.execute(trx);
      } else {
        await sql`
          update app.roles
          set version = version + 1, updated_at = now()
          where id = ${args.roleId}::uuid
            and tenant_id = ${args.tenantId}::uuid
        `.execute(trx);
      }
      if (args.permissions != null) {
        await sql`
          delete from app.role_permissions where role_id = ${args.roleId}::uuid
        `.execute(trx);
        for (const key of args.permissions) {
          await sql`
            insert into app.role_permissions (role_id, permission_key)
            values (${args.roleId}::uuid, ${key})
          `.execute(trx);
        }
      }
      await sql`
        update app.tenants
        set permission_version = permission_version + 1, updated_at = now()
        where id = ${args.tenantId}::uuid
      `.execute(trx);
    });
    this.bumpCache(args.tenantId);
    const roles = await this.listRoles(args.tenantId);
    const updated = roles.find((r) => r.id === args.roleId);
    if (!updated) throw new MembersRolesError("Role not found.", "RESOURCE_NOT_FOUND");
    return updated;
  }

  async archiveRole(args: { readonly tenantId: string; readonly roleId: string }): Promise<void> {
    const ctx = adapterSecurityContext(args.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await sql<{ name: string; archived: boolean }>`
        select name,
               coalesce(metadata->>'archived', 'false') = 'true' as archived
        from app.roles
        where id = ${args.roleId}::uuid
          and tenant_id = ${args.tenantId}::uuid
        limit 1
      `.execute(trx);
      const row = current.rows[0];
      if (!row || row.archived) {
        throw new MembersRolesError("Role not found.", "RESOURCE_NOT_FOUND");
      }
      if (row.name.toLowerCase() === "owner") {
        throw new MembersRolesError("Cannot archive owner role.", "VALIDATION_FAILED");
      }
      await sql`
        update app.roles
        set metadata = coalesce(metadata, '{}'::jsonb) || '{"archived": true}'::jsonb,
            updated_at = now()
        where id = ${args.roleId}::uuid
          and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      await sql`
        update app.tenants
        set permission_version = permission_version + 1, updated_at = now()
        where id = ${args.tenantId}::uuid
      `.execute(trx);
    });
    this.bumpCache(args.tenantId);
  }

  async replaceMemberRoles(args: {
    readonly tenantId: string;
    readonly memberId: string;
    readonly roleIds: readonly string[];
    readonly expectedVersion: number;
  }): Promise<MemberResource> {
    const member = await this.loadMember(args.tenantId, args.memberId);
    if (!member) throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    if (member.version !== args.expectedVersion) {
      throw new MembersRolesError("Member version conflict.", "RESOURCE_VERSION_MISMATCH");
    }

    const ctx = adapterSecurityContext(args.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      for (const roleId of args.roleIds) {
        const role = await sql<{ id: string }>`
          select id from app.roles
          where id = ${roleId}::uuid
            and tenant_id = ${args.tenantId}::uuid
            and coalesce(metadata->>'archived', 'false') <> 'true'
          limit 1
        `.execute(trx);
        if (!role.rows[0]) {
          throw new MembersRolesError("Unknown role_id.", "VALIDATION_FAILED");
        }
      }
    });

    const wasOwner = await this.memberHasOwnerRole(args.tenantId, args.memberId);
    const nextOwner = await this.rolesIncludeOwner(args.tenantId, args.roleIds);
    if (wasOwner && !nextOwner) {
      const ownersLeft = await this.countOwners(args.tenantId, args.memberId);
      if (ownersLeft === 0) {
        throw new MembersRolesError("Cannot remove last owner.", "USER_LAST_OWNER");
      }
    }

    const wasAdmin =
      (await this.memberHasAdminRole(args.tenantId, args.memberId)) && member.status === "active";
    const nextAdmin = await this.rolesIncludeAdmin(args.tenantId, args.roleIds);
    if (wasAdmin && !nextAdmin) {
      const adminsLeft = await this.countAdmins(args.tenantId, args.memberId, args.roleIds);
      if (adminsLeft === 0) {
        throw new MembersRolesError(
          "Cannot remove last admin.",
          "ROLE_WOULD_REMOVE_LAST_ADMIN"
        );
      }
    }

    await withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        delete from app.membership_roles
        where membership_id = ${args.memberId}::uuid
          and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      for (const roleId of args.roleIds) {
        await sql`
          insert into app.membership_roles (id, tenant_id, membership_id, role_id)
          values (${generateUuidV7()}::uuid, ${args.tenantId}::uuid, ${args.memberId}::uuid, ${roleId}::uuid)
        `.execute(trx);
      }
      await sql`
        update app.tenant_memberships
        set version = version + 1, updated_at = now()
        where id = ${args.memberId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      await sql`
        update app.tenants
        set permission_version = permission_version + 1, updated_at = now()
        where id = ${args.tenantId}::uuid
      `.execute(trx);
    });
    this.bumpCache(args.tenantId);
    const updated = await this.loadMember(args.tenantId, args.memberId);
    if (!updated) throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    return updated;
  }

  private async rolesIncludeOwner(
    tenantId: string,
    roleIds: readonly string[]
  ): Promise<boolean> {
    if (roleIds.length === 0) return false;
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{ ok: boolean }>`
        select exists (
          select 1 from app.roles r
          where r.id = any(${[...roleIds]}::uuid[])
            and r.tenant_id = ${tenantId}::uuid
            and lower(r.name) = 'owner'
        ) as ok
      `.execute(trx);
      return Boolean(result.rows[0]?.ok);
    });
  }

  private async rolesIncludeAdmin(
    tenantId: string,
    roleIds: readonly string[]
  ): Promise<boolean> {
    if (roleIds.length === 0) return false;
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{ ok: boolean }>`
        select exists (
          select 1 from app.roles r
          left join app.role_permissions rp on rp.role_id = r.id
          where r.id = any(${[...roleIds]}::uuid[])
            and r.tenant_id = ${tenantId}::uuid
            and (
              lower(r.name) in ('owner', 'admin')
              or rp.permission_key = 'role.manage'
            )
        ) as ok
      `.execute(trx);
      return Boolean(result.rows[0]?.ok);
    });
  }
}
