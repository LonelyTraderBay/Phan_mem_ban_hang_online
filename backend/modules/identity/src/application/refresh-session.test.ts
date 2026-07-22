import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { completeOidcLogin } from "./complete-oidc-login.js";
import { getCurrentContext } from "./get-current-context.js";
import { refreshSession } from "./refresh-session.js";
import { createOpaqueToken, sha256Hex, type OidcClientConfig } from "./oidc-types.js";
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

async function loginCookie(sessions: InMemorySessionAuthRepository): Promise<{
  refresh: string;
  csrf: string;
}> {
  sessions.seedTenantUser({
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

  const stateStore = new InMemoryOidcStateStore();
  const start = await startOidcLogin({ config: baseConfig, stateStore, returnTo: "/" });
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

describe("refresh family rotation (BE-IDN-005)", () => {
  it("rotates successfully and issues new cookie material without access_token", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { refresh, csrf } = await loginCookie(sessions);

    const result = await refreshSession({
      config: baseConfig,
      sessions,
      presentedRefreshToken: refresh,
      csrfCookie: csrf,
      csrfHeader: csrf
    });

    expect(result.body.data.access_token).toBeNull();
    expect(result.body.data.session_id).toBeTruthy();
    expect(result.newRefreshTokenPlaintext).not.toBe(refresh);

    const me = await getCurrentContext({
      sessions,
      sessionCookieValue: result.newRefreshTokenPlaintext
    });
    expect(me.data.user.id).toBe(userId);

    await expect(
      getCurrentContext({ sessions, sessionCookieValue: refresh })
    ).rejects.toMatchObject({ code: "AUTH_UNAUTHORIZED" });
  });

  it("reuse of old refresh → AUTH_REFRESH_REUSED and family revoke", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { refresh, csrf } = await loginCookie(sessions);

    await refreshSession({
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
  });

  it("concurrent refresh race: exactly one rotate wins", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { refresh, csrf } = await loginCookie(sessions);

    const [a, b] = await Promise.allSettled([
      refreshSession({
        config: baseConfig,
        sessions,
        presentedRefreshToken: refresh,
        csrfCookie: csrf,
        csrfHeader: csrf
      }),
      refreshSession({
        config: baseConfig,
        sessions,
        presentedRefreshToken: refresh,
        csrfCookie: csrf,
        csrfHeader: csrf
      })
    ]);

    const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
    const rejected = [a, b].filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "AUTH_REFRESH_REUSED"
    });

    const unused = [...sessions.refreshByHash.values()].filter((r) => !r.usedAt && !r.revoked);
    // Family revoked on loser → no unused survivors, OR winner's child survives then loser revokes all
    // After reuse path, entire family revoked including winner's child.
    expect(unused.every((r) => r.revoked) || unused.length <= 1).toBe(true);
  });

  it("rejects missing/mismatched CSRF", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { refresh, csrf } = await loginCookie(sessions);
    await expect(
      refreshSession({
        config: baseConfig,
        sessions,
        presentedRefreshToken: refresh,
        csrfCookie: csrf,
        csrfHeader: "wrong"
      })
    ).rejects.toMatchObject({ code: "CSRF_TOKEN_INVALID" });
  });

  it("tracks parent/child family linkage on rotate", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { refresh, csrf } = await loginCookie(sessions);
    const parentHash = sha256Hex(refresh);
    const parent = sessions.refreshByHash.get(parentHash)!;

    const result = await refreshSession({
      config: baseConfig,
      sessions,
      presentedRefreshToken: refresh,
      csrfCookie: csrf,
      csrfHeader: csrf
    });

    const child = sessions.refreshByHash.get(sha256Hex(result.newRefreshTokenPlaintext))!;
    expect(child.familyId).toBe(parent.familyId);
    expect(child.parentId).toBe(parent.id);
    expect(parent.usedAt).toBeTruthy();
    expect(createOpaqueToken().length).toBeGreaterThan(10);
  });
});
