/**
 * BE-IDN-015 — Aggregate Auth/RBAC/tenant isolation security suite.
 * Runs cross-cutting negatives that close the Identity matrix gate.
 */
import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { applyFieldPolicies } from "@ai-sales/security";
import {
  createAuditExport,
  InMemoryAuditLogStore,
  listAuditLogs
} from "../../../audit/src/application/list-audit.js";
import {
  inviteMember,
  listMembers,
  MembersRolesError
} from "../../../tenant/src/application/members.js";
import { createRole } from "../../../tenant/src/application/roles.js";
import { InMemoryMembersRolesRepository } from "../../../tenant/src/infrastructure/persistence/in-memory-members-roles.js";
import {
  createSupportAccess,
  InMemorySupportGrantStore
} from "../../../tenant/src/application/support-grant.js";
import { hashInviteToken } from "../../../tenant/src/application/provision-tenant.js";
import { refreshSession } from "./refresh-session.js";
import { completeOidcLogin } from "./complete-oidc-login.js";
import { startOidcLogin } from "./start-oidc-login.js";
import type { OidcClientConfig } from "./oidc-types.js";
import {
  InMemoryOidcStateStore,
  InMemorySessionAuthRepository,
  MemoryOidcTokenClient
} from "../infrastructure/persistence/in-memory-oidc.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1b");
const tenantB = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c2b");
const ownerRoleA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d01");
const adminRoleA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d02");
const staffRoleA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d03");
const ownerMemberA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1c");
const ownerUserA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a");

const baseConfig: OidcClientConfig = {
  enabled: true,
  issuer: "https://idp.example.com",
  clientId: "web-admin",
  clientSecret: "secret",
  redirectUri: "https://app.example.com/api/v1/auth/oidc/callback",
  scopes: "openid profile email",
  authorizationEndpoint: "https://idp.example.com/authorize",
  tokenEndpoint: "https://idp.example.com/token",
  providerName: "idp.example.com",
  sessionCookieName: "ais_session",
  sessionCookieSecure: true,
  sessionAbsoluteTtlHours: 12,
  refreshTtlDays: 30
};

describe("BE-IDN-015 security suite (aggregate)", () => {
  it("tenant isolation: members listed only for actor tenant", async () => {
    const repo = new InMemoryMembersRolesRepository();
    repo.seedTenantRoles({
      tenantId: tenantA,
      ownerRoleId: ownerRoleA,
      adminRoleId: adminRoleA,
      staffRoleId: staffRoleA
    });
    repo.seedActiveOwner({
      tenantId: tenantA,
      memberId: ownerMemberA,
      userId: ownerUserA,
      email: "a@acme.test",
      ownerRoleId: ownerRoleA
    });
    const ownerRoleB = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d11");
    const adminRoleB = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d12");
    repo.seedTenantRoles({
      tenantId: tenantB,
      ownerRoleId: ownerRoleB,
      adminRoleId: adminRoleB
    });
    repo.seedActiveOwner({
      tenantId: tenantB,
      memberId: parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c2c"),
      userId: parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c2a"),
      email: "b@beta.test",
      ownerRoleId: ownerRoleB
    });

    const listedA = await listMembers({
      repo,
      tenantId: tenantA,
      actorPermissions: ["member.read"]
    });
    expect(listedA.data.every((m) => m.tenant_id === tenantA)).toBe(true);
    expect(listedA.data.some((m) => m.tenant_id === tenantB)).toBe(false);
  });

  it("permission negatives: invite/role/audit/support deny without permission", async () => {
    const repo = new InMemoryMembersRolesRepository();
    repo.seedTenantRoles({
      tenantId: tenantA,
      ownerRoleId: ownerRoleA,
      adminRoleId: adminRoleA,
      staffRoleId: staffRoleA
    });
    await expect(
      inviteMember({
        repo,
        tenantId: tenantA,
        actorUserId: ownerUserA,
        actorPermissions: [],
        email: "x@acme.test",
        roleIds: [staffRoleA]
      })
    ).rejects.toBeInstanceOf(MembersRolesError);

    await expect(
      createRole({
        repo,
        tenantId: tenantA,
        actorPermissions: ["role.read"],
        name: "Nope",
        permissions: ["tenant.read"]
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });

    const audit = new InMemoryAuditLogStore();
    await expect(
      listAuditLogs({ store: audit, tenantId: tenantA, actorPermissions: [] })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
    await expect(
      createAuditExport({
        store: audit,
        tenantId: tenantA,
        actorPermissions: ["audit.read"],
        from: new Date().toISOString(),
        to: new Date().toISOString()
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });

    await expect(
      createSupportAccess({
        store: new InMemorySupportGrantStore(),
        actorPermissions: [],
        actorUserId: ownerUserA,
        tenantId: tenantA,
        granteeUserId: ownerUserA,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        reason: "x"
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });

  it("field auth: cost omitted without catalog.cost.read", () => {
    const masked = applyFieldPolicies(
      { id: "1", cost_minor: 9, name: "x" },
      ["catalog.read"]
    );
    expect(masked).toEqual({ id: "1", name: "x" });
  });

  it("refresh reuse fail-closed + invite accept race (second accept fails)", async () => {
    const sessions = new InMemorySessionAuthRepository();
    sessions.seedTenantUser({
      user: { id: ownerUserA, primaryEmail: "owner@acme.test", locale: "vi-VN", status: "active" },
      tenant: {
        id: tenantA,
        code: "acme",
        name: "Acme",
        currency: "VND",
        timezone: "Asia/Ho_Chi_Minh",
        status: "active"
      },
      membership: {
        id: ownerMemberA,
        tenantId: tenantA,
        userId: ownerUserA,
        status: "active",
        displayName: "Owner",
        permissions: ["tenant.read"]
      },
      oidc: { provider: "idp.example.com", subject: "sub-1" }
    });
    const stateStore = new InMemoryOidcStateStore();
    const start = await startOidcLogin({ config: baseConfig, stateStore });
    const state = new URL(start.location).searchParams.get("state")!;
    const completed = await completeOidcLogin({
      config: baseConfig,
      stateStore,
      tokenClient: new MemoryOidcTokenClient(() => ({
        sub: "sub-1",
        email: "owner@acme.test",
        emailVerified: true,
        name: "Owner",
        nonce: null
      })),
      sessions,
      query: { code: "c", state }
    });
    const refresh = completed.session!.refreshTokenPlaintext;
    const csrf = completed.session!.csrfToken;

    const rotated = await refreshSession({
      config: baseConfig,
      sessions,
      presentedRefreshToken: refresh,
      csrfCookie: csrf,
      csrfHeader: csrf
    });
    await expect(
      refreshSession({
        config: baseConfig,
        sessions,
        presentedRefreshToken: refresh,
        csrfCookie: csrf,
        csrfHeader: csrf
      })
    ).rejects.toMatchObject({ code: "AUTH_REFRESH_REUSED" });
    expect(rotated.body.data.access_token).toBeNull();

    const members = new InMemoryMembersRolesRepository();
    members.seedTenantRoles({
      tenantId: tenantA,
      ownerRoleId: ownerRoleA,
      adminRoleId: adminRoleA,
      staffRoleId: staffRoleA
    });
    members.seedActiveOwner({
      tenantId: tenantA,
      memberId: ownerMemberA,
      userId: ownerUserA,
      email: "owner@acme.test",
      ownerRoleId: ownerRoleA
    });
    const invited = await inviteMember({
      repo: members,
      tenantId: tenantA,
      actorUserId: ownerUserA,
      actorPermissions: ["member.invite"],
      email: "race@acme.test",
      roleIds: [staffRoleA]
    });
    const first = await members.acceptInvitation({
      tokenHash: hashInviteToken(invited.inviteToken),
      passwordHash: null,
      now: new Date()
    });
    const second = await members.acceptInvitation({
      tokenHash: hashInviteToken(invited.inviteToken),
      passwordHash: null,
      now: new Date()
    });
    expect(first.outcome).toBe("ok");
    expect(second.outcome).toBe("INVITE_ALREADY_ACCEPTED");
  });
});
