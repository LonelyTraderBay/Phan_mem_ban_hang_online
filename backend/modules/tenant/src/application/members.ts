import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { createInviteToken, hashInviteToken } from "./provision-tenant.js";

export type MemberStatus = "invited" | "active" | "suspended" | "revoked";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type MembersRolesErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "INVITE_EXPIRED"
  | "INVITE_REVOKED"
  | "INVITE_ALREADY_ACCEPTED"
  | "INVITATION_TOKEN_INVALID"
  | "USER_LAST_OWNER"
  | "ROLE_WOULD_REMOVE_LAST_ADMIN"
  | "RESOURCE_VERSION_MISMATCH"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT";

export class MembersRolesError extends Error {
  constructor(
    message: string,
    readonly code: MembersRolesErrorCode
  ) {
    super(message);
    this.name = "MembersRolesError";
  }
}

export interface MemberResource {
  readonly id: string;
  readonly user_id: string;
  readonly tenant_id: string;
  readonly email?: string;
  readonly display_name: string | null;
  readonly status: MemberStatus;
  readonly role_ids: readonly string[];
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface RoleResource {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly permissions: readonly string[];
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface MembersRolesRepository {
  inviteMember(args: {
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
  }): Promise<MemberResource>;

  listMembers(tenantId: string): Promise<readonly MemberResource[]>;

  suspendMember(args: {
    readonly tenantId: string;
    readonly memberId: string;
  }): Promise<MemberResource>;

  activateMember(args: {
    readonly tenantId: string;
    readonly memberId: string;
  }): Promise<MemberResource>;

  revokeMember(args: {
    readonly tenantId: string;
    readonly memberId: string;
  }): Promise<MemberResource>;

  resendInvitation(args: {
    readonly tenantId: string;
    readonly invitationId: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
  }): Promise<MemberResource>;

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

  listRoles(tenantId: string): Promise<readonly RoleResource[]>;

  listPermissionKeys(): Promise<readonly string[]>;

  createRole(args: {
    readonly tenantId: string;
    readonly roleId: UuidV7;
    readonly name: string;
    readonly description: string | null;
    readonly permissions: readonly string[];
  }): Promise<RoleResource>;

  updateRole(args: {
    readonly tenantId: string;
    readonly roleId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
    readonly description: string | null | undefined;
    readonly permissions: readonly string[] | null | undefined;
  }): Promise<RoleResource>;

  archiveRole(args: { readonly tenantId: string; readonly roleId: string }): Promise<void>;

  replaceMemberRoles(args: {
    readonly tenantId: string;
    readonly memberId: string;
    readonly roleIds: readonly string[];
    readonly expectedVersion: number;
  }): Promise<MemberResource>;

  /** Permission cache generation per tenant — bump on role/assignment mutations. */
  getPermissionCacheGeneration(tenantId: string): number;
}

export function requireMemberPermission(
  actorPermissions: readonly string[],
  permission: string
): void {
  if (!actorPermissions.includes(permission)) {
    throw new MembersRolesError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

export async function inviteMember(options: {
  readonly repo: MembersRolesRepository;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly actorPermissions: readonly string[];
  readonly email: string;
  readonly displayName?: string | null;
  readonly roleIds?: readonly string[] | null;
  readonly inviteTtlDays?: number;
  readonly now?: Date;
}): Promise<{
  readonly body: { readonly data: MemberResource; readonly meta: Record<string, never> };
  readonly inviteToken: string;
}> {
  requireMemberPermission(options.actorPermissions, "member.invite");
  const email = options.email.trim().toLowerCase();
  if (!email.includes("@") || email.length > 320) {
    throw new MembersRolesError("Invalid email.", "VALIDATION_FAILED");
  }
  const roleIds = options.roleIds?.length ? options.roleIds : [];
  if (roleIds.length < 1) {
    throw new MembersRolesError("role_ids required.", "VALIDATION_FAILED");
  }
  const now = options.now ?? new Date();
  const token = createInviteToken();
  const member = await options.repo.inviteMember({
    tenantId: options.tenantId,
    actorUserId: options.actorUserId,
    email,
    displayName: options.displayName ?? null,
    roleIds,
    invitationId: generateUuidV7(),
    membershipId: generateUuidV7(),
    userId: generateUuidV7(),
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(now.getTime() + (options.inviteTtlDays ?? 7) * 24 * 60 * 60 * 1000)
  });
  return { body: { data: member, meta: {} }, inviteToken: token };
}

export async function listMembers(options: {
  readonly repo: MembersRolesRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}): Promise<{
  readonly data: readonly MemberResource[];
  readonly page_info: { readonly next_cursor: null; readonly has_more: false };
  readonly meta: Record<string, never>;
}> {
  requireMemberPermission(options.actorPermissions, "member.read");
  const data = await options.repo.listMembers(options.tenantId);
  return { data, page_info: { next_cursor: null, has_more: false }, meta: {} };
}

export async function suspendMember(options: {
  readonly repo: MembersRolesRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly memberId: string;
}): Promise<{ readonly data: MemberResource; readonly meta: Record<string, never> }> {
  requireMemberPermission(options.actorPermissions, "member.update");
  const data = await options.repo.suspendMember({
    tenantId: options.tenantId,
    memberId: options.memberId
  });
  return { data, meta: {} };
}

export async function activateMember(options: {
  readonly repo: MembersRolesRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly memberId: string;
}): Promise<{ readonly data: MemberResource; readonly meta: Record<string, never> }> {
  requireMemberPermission(options.actorPermissions, "member.update");
  const data = await options.repo.activateMember({
    tenantId: options.tenantId,
    memberId: options.memberId
  });
  return { data, meta: {} };
}

export async function revokeMember(options: {
  readonly repo: MembersRolesRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly memberId: string;
}): Promise<{ readonly data: MemberResource; readonly meta: Record<string, never> }> {
  requireMemberPermission(options.actorPermissions, "member.revoke");
  const data = await options.repo.revokeMember({
    tenantId: options.tenantId,
    memberId: options.memberId
  });
  return { data, meta: {} };
}

export async function resendInvitation(options: {
  readonly repo: MembersRolesRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly invitationId: string;
  readonly inviteTtlDays?: number;
  readonly now?: Date;
}): Promise<{
  readonly body: { readonly data: MemberResource; readonly meta: Record<string, never> };
  readonly inviteToken: string;
}> {
  requireMemberPermission(options.actorPermissions, "member.invite");
  const now = options.now ?? new Date();
  const token = createInviteToken();
  const data = await options.repo.resendInvitation({
    tenantId: options.tenantId,
    invitationId: options.invitationId,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(now.getTime() + (options.inviteTtlDays ?? 7) * 24 * 60 * 60 * 1000)
  });
  return { body: { data, meta: {} }, inviteToken: token };
}

export { hashInviteToken, createInviteToken };
