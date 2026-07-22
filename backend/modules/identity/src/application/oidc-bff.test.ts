import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { completeOidcLogin } from "./complete-oidc-login.js";
import { getCurrentContext } from "./get-current-context.js";
import { assertCsrfDoubleSubmit, OidcAuthError, sha256Hex, type OidcClientConfig } from "./oidc-types.js";
import { startOidcLogin } from "./start-oidc-login.js";
import {
  InMemoryOidcStateStore,
  InMemorySessionAuthRepository,
  MemoryOidcTokenClient
} from "../infrastructure/persistence/in-memory-oidc.js";

const userId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a");
const tenantId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1b");
const membershipId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1c");

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

function seedRepo(repo: InMemorySessionAuthRepository): void {
  repo.seedTenantUser({
    user: { id: userId, primaryEmail: "owner@acme.test", locale: "vi-VN", status: "active" },
    tenant: {
      id: tenantId,
      code: "acme",
      name: "Acme",
      currency: "VND",
      timezone: "Asia/Ho_Chi_Minh",
      status: "active"
    },
    membership: {
      id: membershipId,
      tenantId,
      userId,
      status: "active",
      displayName: "Owner",
      permissions: ["tenant.read"]
    },
    oidc: { provider: "idp.example.com", subject: "sub-1" }
  });
}

describe("OIDC BFF (BE-IDN-003)", () => {
  it("start redirects to IdP with state/nonce/pkce", async () => {
    const stateStore = new InMemoryOidcStateStore();
    const result = await startOidcLogin({
      config: baseConfig,
      stateStore,
      returnTo: "/dashboard",
      correlationId: "corr-1"
    });
    expect(result.status).toBe(302);
    const loc = new URL(result.location);
    expect(loc.origin + loc.pathname).toBe("https://idp.example.com/authorize");
    expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
    expect(loc.searchParams.get("state")).toBeTruthy();
    expect(stateStore.rows.size).toBe(1);
  });

  it("rejects unsafe return_to", async () => {
    await expect(
      startOidcLogin({
        config: baseConfig,
        stateStore: new InMemoryOidcStateStore(),
        returnTo: "https://evil.example"
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("happy path: callback sets session then GET /me works", async () => {
    const stateStore = new InMemoryOidcStateStore();
    const sessions = new InMemorySessionAuthRepository();
    seedRepo(sessions);

    const start = await startOidcLogin({
      config: baseConfig,
      stateStore,
      returnTo: "/home"
    });
    const state = new URL(start.location).searchParams.get("state")!;

    const tokenClient = new MemoryOidcTokenClient(async ({ expectedNonceHash }) => {
      const row = [...stateStore.rows.values()][0]!;
      expect(row.nonceHash).toBe(expectedNonceHash);
      return {
        sub: "sub-1",
        email: "owner@acme.test",
        emailVerified: true,
        name: "Owner",
        nonce: null
      };
    });

    const completed = await completeOidcLogin({
      config: baseConfig,
      stateStore,
      tokenClient,
      sessions,
      query: { code: "auth-code", state }
    });

    expect(completed.location).toBe("/home");
    expect(completed.session?.refreshTokenPlaintext).toBeTruthy();
    expect(completed.session?.csrfToken).toBeTruthy();
    expect(JSON.stringify(completed.session?.bootstrap)).not.toMatch(/access_token/);

    const me = await getCurrentContext({
      sessions,
      sessionCookieValue: completed.session!.refreshTokenPlaintext
    });
    expect(me.data.user.display_name).toBe("Owner");
    expect(me.data.permissions).toContain("tenant.read");
    expect(me.data.tenant.id).toBe(tenantId);
  });

  it("maps IdP error= to AUTH_OIDC_PROVIDER_ERROR", async () => {
    await expect(
      completeOidcLogin({
        config: baseConfig,
        stateStore: new InMemoryOidcStateStore(),
        tokenClient: new MemoryOidcTokenClient(() => {
          throw new Error("unused");
        }),
        sessions: new InMemorySessionAuthRepository(),
        query: { error: "access_denied", state: "x", code: "y" }
      })
    ).rejects.toMatchObject({ code: "AUTH_OIDC_PROVIDER_ERROR" });
  });

  it("invalid/missing state → AUTH_OIDC_STATE_INVALID", async () => {
    await expect(
      completeOidcLogin({
        config: baseConfig,
        stateStore: new InMemoryOidcStateStore(),
        tokenClient: new MemoryOidcTokenClient(() => {
          throw new Error("unused");
        }),
        sessions: new InMemorySessionAuthRepository(),
        query: { code: "c", state: "bogus" }
      })
    ).rejects.toMatchObject({ code: "AUTH_OIDC_STATE_INVALID" });
  });

  it("exchange failure → AUTH_OIDC_EXCHANGE_FAILED", async () => {
    const stateStore = new InMemoryOidcStateStore();
    const start = await startOidcLogin({ config: baseConfig, stateStore });
    const state = new URL(start.location).searchParams.get("state")!;
    await expect(
      completeOidcLogin({
        config: baseConfig,
        stateStore,
        tokenClient: new MemoryOidcTokenClient(() => {
          throw new Error("network");
        }),
        sessions: new InMemorySessionAuthRepository(),
        query: { code: "c", state }
      })
    ).rejects.toMatchObject({ code: "AUTH_OIDC_EXCHANGE_FAILED" });
  });

  it("state is single-use", async () => {
    const stateStore = new InMemoryOidcStateStore();
    const sessions = new InMemorySessionAuthRepository();
    seedRepo(sessions);
    const start = await startOidcLogin({ config: baseConfig, stateStore });
    const state = new URL(start.location).searchParams.get("state")!;
    const tokenClient = new MemoryOidcTokenClient(() => ({
      sub: "sub-1",
      email: "owner@acme.test",
      emailVerified: true,
      name: "Owner",
      nonce: null
    }));
    await completeOidcLogin({
      config: baseConfig,
      stateStore,
      tokenClient,
      sessions,
      query: { code: "c1", state }
    });
    await expect(
      completeOidcLogin({
        config: baseConfig,
        stateStore,
        tokenClient,
        sessions,
        query: { code: "c2", state }
      })
    ).rejects.toMatchObject({ code: "AUTH_OIDC_STATE_INVALID" });
  });

  it("MFA-required redirects to /2fa?challenge_id= without session cookies payload", async () => {
    const stateStore = new InMemoryOidcStateStore();
    const sessions = new InMemorySessionAuthRepository();
    seedRepo(sessions);
    sessions.mfaUserIds.add(userId);
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
      mfa: sessions,
      query: { code: "c", state }
    });
    expect(completed.location).toMatch(/^\/2fa\?challenge_id=/);
    expect(completed.session).toBeUndefined();
  });

  it("enforces CSRF double-submit", () => {
    expect(() => assertCsrfDoubleSubmit("abc", "abc")).not.toThrow();
    expect(() => assertCsrfDoubleSubmit("abc", "xyz")).toThrow(OidcAuthError);
  });

  it("hashes session cookie for lookup", () => {
    expect(sha256Hex("token")).toHaveLength(64);
  });
});
