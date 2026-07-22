import type { UuidV7 } from "@ai-sales/domain-kernel";
import {
  MembersRolesError,
  type InvitationStatus,
  type MemberResource,
  type MemberStatus,
  type MembersRolesErrorCode,
  type MembersRolesRepository,
  type RoleResource
} from "../../application/members.js";

interface StoredRole {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions: string[];
  version: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  isOwnerRole: boolean;
  isAdminRole: boolean;
}

interface StoredMember {
  id: string;
  userId: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  status: MemberStatus;
  roleIds: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  invitationId: string | null;
}

interface StoredInvitation {
  id: string;
  tenantId: string;
  email: string;
  tokenHash: string;
  status: InvitationStatus;
  roleIds: string[];
  membershipId: string;
  userId: string;
  displayName: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

const DEFAULT_PERMISSIONS = [
  "tenant.read",
  "tenant.update",
  "member.read",
  "member.invite",
  "member.update",
  "member.revoke",
  "role.read",
  "role.manage",
  "audit.read",
  "audit.export"
];

export class InMemoryMembersRolesRepository implements MembersRolesRepository {
  readonly roles = new Map<string, StoredRole>();
  readonly members = new Map<string, StoredMember>();
  readonly invitations = new Map<string, StoredInvitation>();
  readonly invitationsByHash = new Map<string, string>();
  readonly permissionKeys = [...DEFAULT_PERMISSIONS];
  readonly permissionCacheGeneration = new Map<string, number>();
  readonly passwordHashes = new Map<string, string>();

  seedTenantRoles(args: {
    tenantId: string;
    ownerRoleId: string;
    adminRoleId: string;
    staffRoleId?: string;
  }): void {
    const now = new Date();
    this.roles.set(args.ownerRoleId, {
      id: args.ownerRoleId,
      tenantId: args.tenantId,
      name: "Owner",
      description: "Owner",
      permissions: [...DEFAULT_PERMISSIONS],
      version: 1,
      archived: false,
      createdAt: now,
      updatedAt: now,
      isOwnerRole: true,
      isAdminRole: true
    });
    this.roles.set(args.adminRoleId, {
      id: args.adminRoleId,
      tenantId: args.tenantId,
      name: "Admin",
      description: "Admin",
      permissions: DEFAULT_PERMISSIONS.filter((p) => p !== "tenant.update"),
      version: 1,
      archived: false,
      createdAt: now,
      updatedAt: now,
      isOwnerRole: false,
      isAdminRole: true
    });
    if (args.staffRoleId) {
      this.roles.set(args.staffRoleId, {
        id: args.staffRoleId,
        tenantId: args.tenantId,
        name: "Staff",
        description: "Staff",
        permissions: ["tenant.read", "member.read"],
        version: 1,
        archived: false,
        createdAt: now,
        updatedAt: now,
        isOwnerRole: false,
        isAdminRole: false
      });
    }
    this.permissionCacheGeneration.set(args.tenantId, 1);
  }

  seedActiveOwner(args: {
    tenantId: string;
    memberId: string;
    userId: string;
    email: string;
    ownerRoleId: string;
  }): MemberResource {
    const now = new Date();
    const member: StoredMember = {
      id: args.memberId,
      userId: args.userId,
      tenantId: args.tenantId,
      email: args.email.toLowerCase(),
      displayName: "Owner",
      status: "active",
      roleIds: [args.ownerRoleId],
      version: 1,
      createdAt: now,
      updatedAt: now,
      invitationId: null
    };
    this.members.set(member.id, member);
    return this.toMember(member);
  }

  private bumpCache(tenantId: string): void {
    this.permissionCacheGeneration.set(
      tenantId,
      (this.permissionCacheGeneration.get(tenantId) ?? 0) + 1
    );
  }

  getPermissionCacheGeneration(tenantId: string): number {
    return this.permissionCacheGeneration.get(tenantId) ?? 0;
  }

  private toMember(m: StoredMember): MemberResource {
    return {
      id: m.id,
      user_id: m.userId,
      tenant_id: m.tenantId,
      email: m.email,
      display_name: m.displayName,
      status: m.status,
      role_ids: [...m.roleIds],
      version: m.version,
      created_at: m.createdAt.toISOString(),
      updated_at: m.updatedAt.toISOString()
    };
  }

  private toRole(r: StoredRole): RoleResource {
    return {
      id: r.id,
      tenant_id: r.tenantId,
      name: r.name,
      description: r.description,
      permissions: [...r.permissions],
      version: r.version,
      created_at: r.createdAt.toISOString(),
      updated_at: r.updatedAt.toISOString()
    };
  }

  private permissionsForRoles(roleIds: readonly string[]): string[] {
    const set = new Set<string>();
    for (const id of roleIds) {
      const role = this.roles.get(id);
      if (role && !role.archived) {
        for (const p of role.permissions) set.add(p);
      }
    }
    return [...set].sort();
  }

  private countOwners(tenantId: string, excludingMemberId?: string): number {
    let count = 0;
    for (const m of this.members.values()) {
      if (m.tenantId !== tenantId) continue;
      if (excludingMemberId && m.id === excludingMemberId) continue;
      if (m.status !== "active") continue;
      if (m.roleIds.some((rid) => this.roles.get(rid)?.isOwnerRole)) count += 1;
    }
    return count;
  }

  private countAdmins(tenantId: string, excludingMemberId?: string, nextRoleIds?: readonly string[]): number {
    let count = 0;
    for (const m of this.members.values()) {
      if (m.tenantId !== tenantId) continue;
      if (m.status !== "active" && m.id !== excludingMemberId) continue;
      const roles = m.id === excludingMemberId && nextRoleIds ? nextRoleIds : m.roleIds;
      if (excludingMemberId && m.id === excludingMemberId && nextRoleIds) {
        if (roles.some((rid) => this.roles.get(rid)?.isAdminRole || this.roles.get(rid)?.isOwnerRole)) {
          count += 1;
        }
        continue;
      }
      if (excludingMemberId && m.id === excludingMemberId) continue;
      if (m.status !== "active") continue;
      if (roles.some((rid) => this.roles.get(rid)?.isAdminRole || this.roles.get(rid)?.isOwnerRole)) {
        count += 1;
      }
    }
    return count;
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
    for (const roleId of args.roleIds) {
      const role = this.roles.get(roleId);
      if (!role || role.tenantId !== args.tenantId || role.archived) {
        throw new MembersRolesError("Unknown role_id.", "VALIDATION_FAILED");
      }
    }
    for (const inv of this.invitations.values()) {
      if (inv.tenantId === args.tenantId && inv.email === args.email && inv.status === "pending") {
        throw new MembersRolesError("Pending invitation already exists.", "CONFLICT");
      }
    }
    for (const m of this.members.values()) {
      if (m.tenantId === args.tenantId && m.email === args.email && m.status !== "revoked") {
        throw new MembersRolesError("Member already exists.", "CONFLICT");
      }
    }

    const now = new Date();
    const invitation: StoredInvitation = {
      id: args.invitationId,
      tenantId: args.tenantId,
      email: args.email,
      tokenHash: args.tokenHash,
      status: "pending",
      roleIds: [...args.roleIds],
      membershipId: args.membershipId,
      userId: args.userId,
      displayName: args.displayName,
      expiresAt: args.expiresAt,
      acceptedAt: null,
      revokedAt: null
    };
    this.invitations.set(invitation.id, invitation);
    this.invitationsByHash.set(args.tokenHash, invitation.id);

    const member: StoredMember = {
      id: args.membershipId,
      userId: args.userId,
      tenantId: args.tenantId,
      email: args.email,
      displayName: args.displayName,
      status: "invited",
      roleIds: [...args.roleIds],
      version: 1,
      createdAt: now,
      updatedAt: now,
      invitationId: invitation.id
    };
    this.members.set(member.id, member);
    return this.toMember(member);
  }

  async listMembers(tenantId: string): Promise<readonly MemberResource[]> {
    return [...this.members.values()]
      .filter((m) => m.tenantId === tenantId)
      .map((m) => this.toMember(m));
  }

  async suspendMember(args: {
    readonly tenantId: string;
    readonly memberId: string;
  }): Promise<MemberResource> {
    const member = this.members.get(args.memberId);
    if (!member || member.tenantId !== args.tenantId) {
      throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    }
    if (member.status === "invited") {
      throw new MembersRolesError("Cannot suspend invited member.", "VALIDATION_FAILED");
    }
    if (
      member.roleIds.some((rid) => this.roles.get(rid)?.isOwnerRole) &&
      this.countOwners(args.tenantId, member.id) === 0
    ) {
      throw new MembersRolesError("Cannot suspend last owner.", "USER_LAST_OWNER");
    }
    member.status = "suspended";
    member.version += 1;
    member.updatedAt = new Date();
    this.bumpCache(args.tenantId);
    return this.toMember(member);
  }

  async activateMember(args: {
    readonly tenantId: string;
    readonly memberId: string;
  }): Promise<MemberResource> {
    const member = this.members.get(args.memberId);
    if (!member || member.tenantId !== args.tenantId) {
      throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    }
    if (member.status !== "suspended") {
      throw new MembersRolesError("Member is not suspended.", "VALIDATION_FAILED");
    }
    member.status = "active";
    member.version += 1;
    member.updatedAt = new Date();
    this.bumpCache(args.tenantId);
    return this.toMember(member);
  }

  async revokeMember(args: {
    readonly tenantId: string;
    readonly memberId: string;
  }): Promise<MemberResource> {
    const member = this.members.get(args.memberId);
    if (!member || member.tenantId !== args.tenantId) {
      throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    }
    if (
      member.status === "active" &&
      member.roleIds.some((rid) => this.roles.get(rid)?.isOwnerRole) &&
      this.countOwners(args.tenantId, member.id) === 0
    ) {
      throw new MembersRolesError("Cannot revoke last owner.", "USER_LAST_OWNER");
    }
    if (member.invitationId) {
      const inv = this.invitations.get(member.invitationId);
      if (inv && inv.status === "pending") {
        inv.status = "revoked";
        inv.revokedAt = new Date();
      }
    }
    member.status = "revoked";
    member.version += 1;
    member.updatedAt = new Date();
    this.bumpCache(args.tenantId);
    return this.toMember(member);
  }

  async resendInvitation(args: {
    readonly tenantId: string;
    readonly invitationId: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
  }): Promise<MemberResource> {
    const inv = this.invitations.get(args.invitationId);
    if (!inv || inv.tenantId !== args.tenantId) {
      throw new MembersRolesError("Invitation not found.", "RESOURCE_NOT_FOUND");
    }
    if (inv.status !== "pending") {
      throw new MembersRolesError("Invitation is not pending.", "VALIDATION_FAILED");
    }
    this.invitationsByHash.delete(inv.tokenHash);
    inv.tokenHash = args.tokenHash;
    inv.expiresAt = args.expiresAt;
    this.invitationsByHash.set(args.tokenHash, inv.id);
    const member = this.members.get(inv.membershipId);
    if (!member) throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    member.updatedAt = new Date();
    member.version += 1;
    return this.toMember(member);
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
    const invId = this.invitationsByHash.get(args.tokenHash);
    if (!invId) return { outcome: "INVITATION_TOKEN_INVALID" };
    const inv = this.invitations.get(invId);
    if (!inv) return { outcome: "INVITATION_TOKEN_INVALID" };

    if (inv.status === "accepted") return { outcome: "INVITE_ALREADY_ACCEPTED" };
    if (inv.status === "revoked") return { outcome: "INVITE_REVOKED" };
    if (inv.status === "expired" || inv.expiresAt.getTime() <= args.now.getTime()) {
      inv.status = "expired";
      return { outcome: "INVITE_EXPIRED" };
    }
    if (inv.status !== "pending") return { outcome: "INVITATION_TOKEN_INVALID" };

    inv.status = "accepted";
    inv.acceptedAt = args.now;
    const member = this.members.get(inv.membershipId);
    if (!member) return { outcome: "INVITATION_TOKEN_INVALID" };
    member.status = "active";
    member.version += 1;
    member.updatedAt = args.now;
    if (args.passwordHash) {
      this.passwordHashes.set(member.userId, args.passwordHash);
    }
    this.bumpCache(inv.tenantId);
    return {
      outcome: "ok",
      tenantId: inv.tenantId,
      userId: member.userId,
      membershipId: member.id,
      email: member.email,
      displayName: member.displayName,
      roleIds: [...member.roleIds],
      permissions: this.permissionsForRoles(member.roleIds)
    };
  }

  async listRoles(tenantId: string): Promise<readonly RoleResource[]> {
    return [...this.roles.values()]
      .filter((r) => r.tenantId === tenantId && !r.archived)
      .map((r) => this.toRole(r));
  }

  async listPermissionKeys(): Promise<readonly string[]> {
    return [...this.permissionKeys];
  }

  async createRole(args: {
    readonly tenantId: string;
    readonly roleId: UuidV7;
    readonly name: string;
    readonly description: string | null;
    readonly permissions: readonly string[];
  }): Promise<RoleResource> {
    for (const r of this.roles.values()) {
      if (r.tenantId === args.tenantId && !r.archived && r.name === args.name) {
        throw new MembersRolesError("Role name conflict.", "CONFLICT");
      }
    }
    const now = new Date();
    const role: StoredRole = {
      id: args.roleId,
      tenantId: args.tenantId,
      name: args.name,
      description: args.description,
      permissions: [...args.permissions],
      version: 1,
      archived: false,
      createdAt: now,
      updatedAt: now,
      isOwnerRole: false,
      isAdminRole: args.permissions.includes("role.manage")
    };
    this.roles.set(role.id, role);
    this.bumpCache(args.tenantId);
    return this.toRole(role);
  }

  async updateRole(args: {
    readonly tenantId: string;
    readonly roleId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
    readonly description: string | null | undefined;
    readonly permissions: readonly string[] | null | undefined;
  }): Promise<RoleResource> {
    const role = this.roles.get(args.roleId);
    if (!role || role.tenantId !== args.tenantId || role.archived) {
      throw new MembersRolesError("Role not found.", "RESOURCE_NOT_FOUND");
    }
    if (role.version !== args.expectedVersion) {
      throw new MembersRolesError("Role version conflict.", "RESOURCE_VERSION_MISMATCH");
    }
    if (args.name != null && args.name !== undefined) {
      role.name = args.name.trim();
    }
    if (args.description !== undefined) {
      role.description = args.description;
    }
    if (args.permissions != null) {
      role.permissions = [...args.permissions];
      role.isAdminRole = args.permissions.includes("role.manage");
    }
    role.version += 1;
    role.updatedAt = new Date();
    this.bumpCache(args.tenantId);
    return this.toRole(role);
  }

  async archiveRole(args: { readonly tenantId: string; readonly roleId: string }): Promise<void> {
    const role = this.roles.get(args.roleId);
    if (!role || role.tenantId !== args.tenantId || role.archived) {
      throw new MembersRolesError("Role not found.", "RESOURCE_NOT_FOUND");
    }
    if (role.isOwnerRole) {
      throw new MembersRolesError("Cannot archive owner role.", "VALIDATION_FAILED");
    }
    role.archived = true;
    role.updatedAt = new Date();
    this.bumpCache(args.tenantId);
  }

  async replaceMemberRoles(args: {
    readonly tenantId: string;
    readonly memberId: string;
    readonly roleIds: readonly string[];
    readonly expectedVersion: number;
  }): Promise<MemberResource> {
    const member = this.members.get(args.memberId);
    if (!member || member.tenantId !== args.tenantId) {
      throw new MembersRolesError("Member not found.", "RESOURCE_NOT_FOUND");
    }
    if (member.version !== args.expectedVersion) {
      throw new MembersRolesError("Member version conflict.", "RESOURCE_VERSION_MISMATCH");
    }
    for (const roleId of args.roleIds) {
      const role = this.roles.get(roleId);
      if (!role || role.tenantId !== args.tenantId || role.archived) {
        throw new MembersRolesError("Unknown role_id.", "VALIDATION_FAILED");
      }
    }

    const wasOwner = member.roleIds.some((rid) => this.roles.get(rid)?.isOwnerRole);
    const nextOwner = args.roleIds.some((rid) => this.roles.get(rid)?.isOwnerRole);
    if (wasOwner && !nextOwner && this.countOwners(args.tenantId, member.id) === 0) {
      throw new MembersRolesError("Cannot remove last owner.", "USER_LAST_OWNER");
    }

    const wasAdmin =
      member.roleIds.some(
        (rid) => this.roles.get(rid)?.isAdminRole || this.roles.get(rid)?.isOwnerRole
      ) && member.status === "active";
    const nextAdmin = args.roleIds.some(
      (rid) => this.roles.get(rid)?.isAdminRole || this.roles.get(rid)?.isOwnerRole
    );
    if (wasAdmin && !nextAdmin && this.countAdmins(args.tenantId, member.id, args.roleIds) === 0) {
      throw new MembersRolesError(
        "Cannot remove last admin.",
        "ROLE_WOULD_REMOVE_LAST_ADMIN"
      );
    }

    member.roleIds = [...args.roleIds];
    member.version += 1;
    member.updatedAt = new Date();
    this.bumpCache(args.tenantId);
    return this.toMember(member);
  }
}
