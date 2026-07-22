import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  MembersRolesError,
  requireMemberPermission,
  type MembersRolesRepository,
  type RoleResource,
  type MemberResource
} from "./members.js";

export async function listRoles(options: {
  readonly repo: MembersRolesRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}): Promise<{
  readonly data: readonly RoleResource[];
  readonly page_info: { readonly next_cursor: null; readonly has_more: false };
  readonly meta: Record<string, never>;
}> {
  requireMemberPermission(options.actorPermissions, "role.read");
  const data = await options.repo.listRoles(options.tenantId);
  return { data, page_info: { next_cursor: null, has_more: false }, meta: {} };
}

export async function listPermissionsCatalog(options: {
  readonly repo: MembersRolesRepository;
  readonly actorPermissions: readonly string[];
}): Promise<{
  readonly data: readonly RoleResource[];
  readonly page_info: { readonly next_cursor: null; readonly has_more: false };
  readonly meta: Record<string, never>;
}> {
  requireMemberPermission(options.actorPermissions, "role.read");
  // Contract currently types ListPermissions as RoleResource[]; expose catalog as synthetic rows.
  const keys = await options.repo.listPermissionKeys();
  const now = new Date().toISOString();
  const data: RoleResource[] = keys.map((key, i) => ({
    id: `00000000-0000-7000-8000-${String(i + 1).padStart(12, "0")}`,
    tenant_id: "00000000-0000-7000-8000-000000000000",
    name: key,
    description: null,
    permissions: [key],
    version: 1,
    created_at: now,
    updated_at: now
  }));
  return { data, page_info: { next_cursor: null, has_more: false }, meta: {} };
}

export async function createRole(options: {
  readonly repo: MembersRolesRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly name: string;
  readonly description?: string | null;
  readonly permissions: readonly string[];
}): Promise<{ readonly data: RoleResource; readonly meta: Record<string, never> }> {
  requireMemberPermission(options.actorPermissions, "role.manage");
  const name = options.name.trim();
  if (!name || name.length > 100) {
    throw new MembersRolesError("Invalid role name.", "VALIDATION_FAILED");
  }
  if (!options.permissions.length) {
    throw new MembersRolesError("permissions required.", "VALIDATION_FAILED");
  }
  const data = await options.repo.createRole({
    tenantId: options.tenantId,
    roleId: generateUuidV7(),
    name,
    description: options.description ?? null,
    permissions: options.permissions
  });
  return { data, meta: {} };
}

export async function updateRole(options: {
  readonly repo: MembersRolesRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly roleId: string;
  readonly expectedVersion: number;
  readonly name?: string | null;
  readonly description?: string | null;
  readonly permissions?: readonly string[] | null;
}): Promise<{ readonly data: RoleResource; readonly meta: Record<string, never> }> {
  requireMemberPermission(options.actorPermissions, "role.manage");
  const data = await options.repo.updateRole({
    tenantId: options.tenantId,
    roleId: options.roleId,
    expectedVersion: options.expectedVersion,
    name: options.name,
    description: options.description,
    permissions: options.permissions
  });
  return { data, meta: {} };
}

export async function archiveRole(options: {
  readonly repo: MembersRolesRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly roleId: string;
}): Promise<void> {
  requireMemberPermission(options.actorPermissions, "role.manage");
  await options.repo.archiveRole({ tenantId: options.tenantId, roleId: options.roleId });
}

export async function replaceMemberRoles(options: {
  readonly repo: MembersRolesRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly memberId: string;
  readonly roleIds: readonly string[];
  readonly expectedVersion: number;
}): Promise<{ readonly data: MemberResource; readonly meta: Record<string, never> }> {
  requireMemberPermission(options.actorPermissions, "role.manage");
  const data = await options.repo.replaceMemberRoles({
    tenantId: options.tenantId,
    memberId: options.memberId,
    roleIds: options.roleIds,
    expectedVersion: options.expectedVersion
  });
  return { data, meta: {} };
}

export type { UuidV7 };
