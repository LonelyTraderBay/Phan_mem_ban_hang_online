import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { completeOidcLogin } from "./complete-oidc-login.js";
import { getCurrentContext } from "./get-current-context.js";
import { listDevices, logoutSession, revokeDevice, revokeSession } from "./logout-revoke.js";
import { startOidcLogin } from "./start-oidc-login.js";
import type { OidcClientConfig } from "./oidc-types.js";
import {
  InMemoryOidcStateStore,
  InMemorySessionAuthRepository,
  MemoryOidcTokenClient
} from "../infrastructure/persistence/in-memory-oidc.js";

const userId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a");
const otherUserId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c2a");
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

async function login(sessions: InMemorySessionAuthRepository): Promise<{
  refresh: string;
  csrf: string;
  sessionId: string;
  deviceId: string;
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
    csrf: completed.session!.csrfToken,
    sessionId: completed.session!.bootstrap.session.id,
    deviceId: completed.session!.bootstrap.device.id
  };
}

describe("logout / device revoke (BE-IDN-006)", () => {
  it("logout clears session so /me fails", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { refresh, csrf } = await login(sessions);

    await logoutSession({
      sessions,
      presentedRefreshToken: refresh,
      csrfCookie: csrf,
      csrfHeader: csrf
    });

    expect(sessions.outbox[0]?.type).toBe("com.aisales.identity.session-revoked.v1");
    await expect(
      getCurrentContext({ sessions, sessionCookieValue: refresh })
    ).rejects.toMatchObject({ code: "AUTH_UNAUTHORIZED" });
  });

  it("device revoke then double revoke → DEVICE_ALREADY_REVOKED", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { refresh, csrf, deviceId } = await login(sessions);

    await revokeDevice({
      sessions,
      actorUserId: userId,
      deviceId,
      csrfCookie: csrf,
      csrfHeader: csrf
    });

    await expect(
      getCurrentContext({ sessions, sessionCookieValue: refresh })
    ).rejects.toMatchObject({ code: "AUTH_UNAUTHORIZED" });

    await expect(
      revokeDevice({
        sessions,
        actorUserId: userId,
        deviceId,
        csrfCookie: csrf,
        csrfHeader: csrf
      })
    ).rejects.toMatchObject({ code: "DEVICE_ALREADY_REVOKED" });
  });

  it("session revoke other user → RESOURCE_NOT_FOUND", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { csrf, sessionId } = await login(sessions);

    await expect(
      revokeSession({
        sessions,
        actorUserId: otherUserId,
        sessionId,
        csrfCookie: csrf,
        csrfHeader: csrf
      })
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("idempotent session revoke returns DEVICE_ALREADY_REVOKED on second call", async () => {
    const sessions = new InMemorySessionAuthRepository();
    const { csrf, sessionId } = await login(sessions);

    await revokeSession({
      sessions,
      actorUserId: userId,
      sessionId,
      csrfCookie: csrf,
      csrfHeader: csrf
    });

    await expect(
      revokeSession({
        sessions,
        actorUserId: userId,
        sessionId,
        csrfCookie: csrf,
        csrfHeader: csrf
      })
    ).rejects.toMatchObject({ code: "DEVICE_ALREADY_REVOKED" });
  });

  it("lists devices for actor", async () => {
    const sessions = new InMemorySessionAuthRepository();
    await login(sessions);
    const listed = await listDevices({ sessions, actorUserId: userId });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.platform).toBe("web");
  });
});
