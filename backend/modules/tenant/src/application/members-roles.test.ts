import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { hashInviteToken } from "./provision-tenant.js";
import {
  activateMember,
  inviteMember,
  listMembers,
  revokeMember,
  suspendMember
} from "./members.js";
import {
  createRole,
  listRoles,
  replaceMemberRoles,
  updateRole
} from "./roles.js";
import { InMemoryMembersRolesRepository } from "../infrastructure/persistence/in-memory-members-roles.js";

const tenantId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1b");
const ownerRoleId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d01");
const adminRoleId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d02");
const staffRoleId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d03");
const ownerMemberId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1c");
const ownerUserId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a");

const adminPerms = [
  "member.read",
  "member.invite",
  "member.update",
  "member.revoke",
  "role.read",
  "role.manage"
];

function seed() {
  const repo = new InMemoryMembersRolesRepository();
  repo.seedTenantRoles({ tenantId, ownerRoleId, adminRoleId, staffRoleId });
  repo.seedActiveOwner({
    tenantId,
    memberId: ownerMemberId,
    userId: ownerUserId,
    email: "owner@acme.test",
    ownerRoleId
  });
  return repo;
}

describe("BE-IDN-010 members / invites", () => {
  it("invite + accept happy path (token single-use)", async () => {
    const repo = seed();
    const invited = await inviteMember({
      repo,
      tenantId,
      actorUserId: ownerUserId,
      actorPermissions: adminPerms,
      email: "staff@acme.test",
      displayName: "Staff",
      roleIds: [staffRoleId]
    });
    expect(invited.body.data.status).toBe("invited");

    const first = await repo.acceptInvitation({
      tokenHash: hashInviteToken(invited.inviteToken),
      passwordHash: null,
      now: new Date()
    });
    expect(first.outcome).toBe("ok");

    const second = await repo.acceptInvitation({
      tokenHash: hashInviteToken(invited.inviteToken),
      passwordHash: null,
      now: new Date()
    });
    expect(second.outcome).toBe("INVITE_ALREADY_ACCEPTED");

    const listed = await listMembers({ repo, tenantId, actorPermissions: adminPerms });
    expect(listed.data.some((m) => m.email === "staff@acme.test" && m.status === "active")).toBe(
      true
    );
  });

  it("maps expired / revoked invite outcomes", async () => {
    const repo = seed();
    const invited = await inviteMember({
      repo,
      tenantId,
      actorUserId: ownerUserId,
      actorPermissions: adminPerms,
      email: "a@acme.test",
      roleIds: [staffRoleId],
      inviteTtlDays: 0,
      now: new Date(Date.now() - 60_000)
    });
    const expired = await repo.acceptInvitation({
      tokenHash: hashInviteToken(invited.inviteToken),
      passwordHash: null,
      now: new Date()
    });
    expect(expired.outcome).toBe("INVITE_EXPIRED");

    const invited2 = await inviteMember({
      repo,
      tenantId,
      actorUserId: ownerUserId,
      actorPermissions: adminPerms,
      email: "b@acme.test",
      roleIds: [staffRoleId]
    });
    await revokeMember({
      repo,
      tenantId,
      actorPermissions: adminPerms,
      memberId: invited2.body.data.id
    });
    const revoked = await repo.acceptInvitation({
      tokenHash: hashInviteToken(invited2.inviteToken),
      passwordHash: null,
      now: new Date()
    });
    expect(revoked.outcome).toBe("INVITE_REVOKED");
  });

  it("USER_LAST_OWNER on revoke last owner", async () => {
    const repo = seed();
    await expect(
      revokeMember({
        repo,
        tenantId,
        actorPermissions: adminPerms,
        memberId: ownerMemberId
      })
    ).rejects.toMatchObject({ code: "USER_LAST_OWNER" });
  });

  it("member.invite permission enforced", async () => {
    const repo = seed();
    await expect(
      inviteMember({
        repo,
        tenantId,
        actorUserId: ownerUserId,
        actorPermissions: ["member.read"],
        email: "x@acme.test",
        roleIds: [staffRoleId]
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });

  it("suspend then activate", async () => {
    const repo = seed();
    const invited = await inviteMember({
      repo,
      tenantId,
      actorUserId: ownerUserId,
      actorPermissions: adminPerms,
      email: "c@acme.test",
      roleIds: [adminRoleId]
    });
    await repo.acceptInvitation({
      tokenHash: hashInviteToken(invited.inviteToken),
      passwordHash: null,
      now: new Date()
    });
    const suspended = await suspendMember({
      repo,
      tenantId,
      actorPermissions: adminPerms,
      memberId: invited.body.data.id
    });
    expect(suspended.data.status).toBe("suspended");
    const activated = await activateMember({
      repo,
      tenantId,
      actorPermissions: adminPerms,
      memberId: invited.body.data.id
    });
    expect(activated.data.status).toBe("active");
  });
});

describe("BE-IDN-011 roles", () => {
  it("role.manage enforced + create/list", async () => {
    const repo = seed();
    await expect(
      createRole({
        repo,
        tenantId,
        actorPermissions: ["role.read"],
        name: "Custom",
        permissions: ["tenant.read"]
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });

    const created = await createRole({
      repo,
      tenantId,
      actorPermissions: adminPerms,
      name: "Custom",
      permissions: ["tenant.read", "member.read"]
    });
    expect(created.data.name).toBe("Custom");
    const listed = await listRoles({ repo, tenantId, actorPermissions: adminPerms });
    expect(listed.data.some((r) => r.id === created.data.id)).toBe(true);
  });

  it("stale expected_version → RESOURCE_VERSION_MISMATCH", async () => {
    const repo = seed();
    const created = await createRole({
      repo,
      tenantId,
      actorPermissions: adminPerms,
      name: "V1",
      permissions: ["tenant.read"]
    });
    await updateRole({
      repo,
      tenantId,
      actorPermissions: adminPerms,
      roleId: created.data.id,
      expectedVersion: created.data.version,
      name: "V2"
    });
    await expect(
      updateRole({
        repo,
        tenantId,
        actorPermissions: adminPerms,
        roleId: created.data.id,
        expectedVersion: created.data.version,
        name: "V3"
      })
    ).rejects.toMatchObject({ code: "RESOURCE_VERSION_MISMATCH" });
  });

  it("ROLE_WOULD_REMOVE_LAST_ADMIN + permission cache bump", async () => {
    const repo = new InMemoryMembersRolesRepository();
    repo.seedTenantRoles({ tenantId, ownerRoleId, adminRoleId, staffRoleId });
    const adminOnlyId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c9c");
    const adminOnlyUser = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c9a");
    const now = new Date();
    repo.members.set(adminOnlyId, {
      id: adminOnlyId,
      userId: adminOnlyUser,
      tenantId,
      email: "solo-admin@acme.test",
      displayName: "Solo Admin",
      status: "active",
      roleIds: [adminRoleId],
      version: 1,
      createdAt: now,
      updatedAt: now,
      invitationId: null
    });
    const before = repo.getPermissionCacheGeneration(tenantId);

    await expect(
      replaceMemberRoles({
        repo,
        tenantId,
        actorPermissions: adminPerms,
        memberId: adminOnlyId,
        roleIds: [staffRoleId],
        expectedVersion: 1
      })
    ).rejects.toMatchObject({ code: "ROLE_WOULD_REMOVE_LAST_ADMIN" });

    // Owner + admin: demoting admin succeeds and bumps cache
    repo.seedActiveOwner({
      tenantId,
      memberId: ownerMemberId,
      userId: ownerUserId,
      email: "owner@acme.test",
      ownerRoleId
    });
    await replaceMemberRoles({
      repo,
      tenantId,
      actorPermissions: adminPerms,
      memberId: adminOnlyId,
      roleIds: [staffRoleId],
      expectedVersion: 1
    });
    expect(repo.getPermissionCacheGeneration(tenantId)).toBeGreaterThan(before);
  });
});
