import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { completeOidcLogin } from "./complete-oidc-login.js";
import { getCurrentContext } from "./get-current-context.js";
import { startOidcLogin } from "./start-oidc-login.js";
import { switchTenant } from "./switch-tenant.js";
import type { OidcClientConfig } from "./oidc-types.js";
import {
  InMemoryOidcStateStore,
  InMemorySessionAuthRepository,
  MemoryOidcTokenClient
} from "../infrastructure/persistence/in-memory-oidc.js";

const userId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a");
const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1b");
const tenantB = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c2b");
const tenantC = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c3b");
const membershipA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1c");
const membershipB = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c2c");
const membershipInactive = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c3c");

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

async function login(sessions: InMemorySessionAuthRepository): Promise<{ refresh: string; csrf: string }> {
  sessions.seedTenantUser({
    user: { id: userId, primaryEmail: "owner@acme.test", locale: "vi-VN", status: "active" },
    tenant: {
      id: tenantA,
      code: "acme",
      name: "Acme",
      currency: "VND",
      timezone: "Asia/Ho_Chi_Minh",
      status: "active"
    },
    membership: {
      id: membershipA,
      tenantId: tenantA,
      userId,
      status: "active",
      displayName: "Owner A",
      permissions: ["tenant.read", "member.read"]
    },
    oidc: { provider: "idp.example.com", subject: "sub-1" }
  });

  sessions.tenants.set(tenantB, {
    id: tenantB,
    code: "beta",
    name: "Beta Co",
    currency: "USD",
    timezone: "UTC",
    status: "active"
  });
  sessions.memberships.push({
    id: membershipB,
    tenantId: tenantB,
    userId,
    status: "active",
    displayName: "Owner B",
    permissions: ["tenant.read", "catalog.read"]
  });

  sessions.tenants.set(tenantC, {
    id: tenantC,
    code: "cold",
    name: "Cold Co",
    currency: "VND",
    timezone: "Asia/Ho_Chi_Minh",
    status: "active"
  });
  sessions.memberships.push({
    id: membershipInactive,
    tenantId: tenantC,
    userId,
    status: "suspended",
    displayName: "Suspended",
    permissions: ["tenant.read"]
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
  return {
    refresh: completed.session!.refreshTokenPlaintext,
    csrf: completed.session!.csrfToken
  };
}

describe("switch tenant (BE-IDN-009)", () => {
  it("switches context and GET /me matches", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { refresh, csrf } = await login(sessions);

    const before = await getCurrentContext({
      sessions,
      sessionCookieValue: refresh
    });
    expect(before.data.tenant.id).toBe(tenantA);

    const switched = await switchTenant({
      sessions,
      presentedRefreshToken: refresh,
      csrfCookie: csrf,
      csrfHeader: csrf,
      tenantId: tenantB
    });
    expect(switched.data.tenant.id).toBe(tenantB);
    expect(switched.data.tenant.name).toBe("Beta Co");
    expect(switched.data.permissions).toEqual(["tenant.read", "catalog.read"]);
    expect(switched.data.session.version).toBe(before.data.session.version + 1);

    const me = await getCurrentContext({ sessions, sessionCookieValue: refresh });
    expect(me.data.tenant.id).toBe(tenantB);
    expect(me.data.permissions).toEqual(switched.data.permissions);
  });

  it("inactive membership → MEMBERSHIP_INACTIVE", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { refresh, csrf } = await login(sessions);
    await expect(
      switchTenant({
        sessions,
        presentedRefreshToken: refresh,
        csrfCookie: csrf,
        csrfHeader: csrf,
        tenantId: tenantC
      })
    ).rejects.toMatchObject({ code: "MEMBERSHIP_INACTIVE" });
  });

  it("unknown tenant → TENANT_CONTEXT_INVALID", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { refresh, csrf } = await login(sessions);
    await expect(
      switchTenant({
        sessions,
        presentedRefreshToken: refresh,
        csrfCookie: csrf,
        csrfHeader: csrf,
        tenantId: parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7cff")
      })
    ).rejects.toMatchObject({ code: "TENANT_CONTEXT_INVALID" });
  });

  it("requires CSRF", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { refresh, csrf } = await login(sessions);
    await expect(
      switchTenant({
        sessions,
        presentedRefreshToken: refresh,
        csrfCookie: csrf,
        csrfHeader: "wrong",
        tenantId: tenantB
      })
    ).rejects.toMatchObject({ code: "CSRF_TOKEN_INVALID" });
  });
});
