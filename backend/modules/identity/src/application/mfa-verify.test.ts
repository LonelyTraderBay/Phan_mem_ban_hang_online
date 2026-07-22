import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { completeOidcLogin } from "./complete-oidc-login.js";
import {
  assertRecentAuth,
  createStepUpMfaChallenge,
  currentTotpCode,
  enrollTotpFactor,
  verifyMfa
} from "./mfa-verify.js";
import { startOidcLogin } from "./start-oidc-login.js";
import type { OidcClientConfig } from "./oidc-types.js";
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

function seed(sessions: InMemorySessionAuthRepository) {
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
}

describe("BE-IDN-008 MFA TOTP", () => {
  it("enroll + verify after OIDC MFA challenge establishes session", async () => {
    const sessions = new InMemorySessionAuthRepository();
    seed(sessions);
    const enrolled = await enrollTotpFactor({ mfa: sessions, userId });
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
      mfa: sessions,
      query: { code: "c", state }
    });
    expect(completed.session).toBeUndefined();
    const challengeId = new URL(completed.location, "https://app.example.com").searchParams.get(
      "challenge_id"
    );
    expect(challengeId).toBeTruthy();

    const bad = verifyMfa({
      mfa: sessions,
      sessions,
      config: baseConfig,
      challengeId: challengeId!,
      code: "000000"
    });
    await expect(bad).rejects.toMatchObject({ code: "AUTH_MFA_INVALID" });

    const ok = await verifyMfa({
      mfa: sessions,
      sessions,
      config: baseConfig,
      challengeId: challengeId!,
      code: currentTotpCode(enrolled.secret)
    });
    expect(ok.body.data.mfa_required).toBe(false);
    expect(ok.body.data.session_id).toBeTruthy();
    expect(ok.refreshTokenPlaintext).toBeTruthy();

    await expect(
      verifyMfa({
        mfa: sessions,
        sessions,
        config: baseConfig,
        challengeId: challengeId!,
        code: currentTotpCode(enrolled.secret)
      })
    ).rejects.toMatchObject({ code: "AUTH_MFA_INVALID" });
  });

  it("step-up assertRecentAuth → AUTH_RECENT_AUTH_REQUIRED then pass after verify", async () => {
    const sessions = new InMemorySessionAuthRepository();
    seed(sessions);
    const enrolled = await enrollTotpFactor({ mfa: sessions, userId });
    // Direct session without recent MFA
    const sessionId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c99");
    expect(() => assertRecentAuth({ lastMfaAt: null })).toThrowError(
      expect.objectContaining({ code: "AUTH_RECENT_AUTH_REQUIRED" })
    );

    const challengeId = await createStepUpMfaChallenge({
      mfa: sessions,
      userId,
      sessionId
    });
    await verifyMfa({
      mfa: sessions,
      sessions,
      config: baseConfig,
      challengeId,
      code: currentTotpCode(enrolled.secret)
    });
    const recent = await sessions.getRecentAuthAt(sessionId);
    expect(() => assertRecentAuth({ lastMfaAt: recent })).not.toThrow();
  });
});
