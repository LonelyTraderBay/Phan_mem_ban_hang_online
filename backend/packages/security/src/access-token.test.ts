import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { SignJWT, importPKCS8 } from "jose";
import {
  createAccessTokenService,
  generateEs256KeyPairPem,
  parseBearerAuthorization,
  securityContextFromAccessToken,
  AccessTokenError
} from "./access-token.js";

const subject = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a");
const tenantId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1b");
const sessionId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1c");
const membershipId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1d");

describe("access JWT (BE-IDN-004)", () => {
  it("accepts a valid token (iss/aud/exp/kid)", async () => {
    const keys = await generateEs256KeyPairPem();
    const svc = await createAccessTokenService({
      issuer: "https://api.example.com",
      audience: "aisales-api",
      ttlSeconds: 900,
      active: { kid: "k1", privateKeyPem: keys.privateKeyPem }
    });

    const issued = await svc.issue({
      subject,
      tenantId,
      sessionId,
      actorType: "user",
      membershipId
    });
    expect(issued.kid).toBe("k1");
    expect(issued.expiresIn).toBe(900);

    const claims = await svc.verify(issued.accessToken);
    expect(claims.sub).toBe(subject);
    expect(claims.tid).toBe(tenantId);
    expect(claims.sid).toBe(sessionId);
    expect(claims.mid).toBe(membershipId);
    expect(claims.aud).toBe("aisales-api");
    expect(claims.kid).toBe("k1");
  });

  it("rejects wrong audience", async () => {
    const keys = await generateEs256KeyPairPem();
    const issuer = "https://api.example.com";
    const svc = await createAccessTokenService({
      issuer,
      audience: "aisales-api",
      ttlSeconds: 900,
      active: { kid: "k1", privateKeyPem: keys.privateKeyPem }
    });

    const privateKey = await importPKCS8(keys.privateKeyPem, "ES256");
    const now = Math.floor(Date.now() / 1000);
    const badAud = await new SignJWT({ tid: tenantId, sid: sessionId, act: "user" })
      .setProtectedHeader({ alg: "ES256", kid: "k1", typ: "JWT" })
      .setSubject(subject)
      .setIssuer(issuer)
      .setAudience("other-api")
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(privateKey);

    await expect(svc.verify(badAud)).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      message: expect.stringMatching(/audience/i)
    });
  });

  it("maps expired tokens to AUTH_TOKEN_EXPIRED", async () => {
    const keys = await generateEs256KeyPairPem();
    const svc = await createAccessTokenService({
      issuer: "https://api.example.com",
      audience: "aisales-api",
      ttlSeconds: 60,
      active: { kid: "k1", privateKeyPem: keys.privateKeyPem }
    });

    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    const issued = await svc.issue({
      subject,
      tenantId,
      sessionId,
      actorType: "user",
      now: issuedAt
    });

    await expect(svc.verify(issued.accessToken, new Date("2026-01-01T00:02:00.000Z"))).rejects.toMatchObject({
      code: "AUTH_TOKEN_EXPIRED"
    });
  });

  it("dual-accept window: previous kid still verifies after rotation", async () => {
    const oldKeys = await generateEs256KeyPairPem();
    const newKeys = await generateEs256KeyPairPem();

    const beforeRotate = await createAccessTokenService({
      issuer: "https://api.example.com",
      audience: "aisales-api",
      ttlSeconds: 900,
      active: { kid: "2026-06", privateKeyPem: oldKeys.privateKeyPem }
    });
    const legacy = await beforeRotate.issue({
      subject,
      tenantId,
      sessionId,
      actorType: "user"
    });

    const afterRotate = await createAccessTokenService({
      issuer: "https://api.example.com",
      audience: "aisales-api",
      ttlSeconds: 900,
      active: { kid: "2026-07", privateKeyPem: newKeys.privateKeyPem },
      previous: { kid: "2026-06", publicKeyPem: oldKeys.publicKeyPem }
    });

    const legacyClaims = await afterRotate.verify(legacy.accessToken);
    expect(legacyClaims.kid).toBe("2026-06");

    const fresh = await afterRotate.issue({
      subject,
      tenantId,
      sessionId,
      actorType: "user"
    });
    expect(fresh.kid).toBe("2026-07");
    await expect(afterRotate.verify(fresh.accessToken)).resolves.toMatchObject({ kid: "2026-07" });
  });

  it("rejects tokens from a rotated key after the dual-accept window closes", async () => {
    const oldKeys = await generateEs256KeyPairPem();
    const newKeys = await generateEs256KeyPairPem();

    const beforeRotate = await createAccessTokenService({
      issuer: "https://api.example.com",
      audience: "aisales-api",
      ttlSeconds: 900,
      active: { kid: "2026-06", privateKeyPem: oldKeys.privateKeyPem }
    });
    const legacy = await beforeRotate.issue({
      subject,
      tenantId,
      sessionId,
      actorType: "user"
    });

    const windowClosed = await createAccessTokenService({
      issuer: "https://api.example.com",
      audience: "aisales-api",
      ttlSeconds: 900,
      active: { kid: "2026-07", privateKeyPem: newKeys.privateKeyPem }
      // no previous — rotation window closed
    });

    await expect(windowClosed.verify(legacy.accessToken)).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS"
    });
  });

  it("rejects wrong issuer", async () => {
    const keys = await generateEs256KeyPairPem();
    const privateKey = await importPKCS8(keys.privateKeyPem, "ES256");
    const svc = await createAccessTokenService({
      issuer: "https://api.example.com",
      audience: "aisales-api",
      ttlSeconds: 900,
      active: { kid: "k1", privateKeyPem: keys.privateKeyPem }
    });
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ tid: tenantId, sid: sessionId, act: "user" })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setSubject(subject)
      .setIssuer("https://evil.example.com")
      .setAudience("aisales-api")
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(privateKey);

    await expect(svc.verify(token)).rejects.toBeInstanceOf(AccessTokenError);
  });

  it("parses Bearer authorization and maps security context without trusting JWT permissions", async () => {
    expect(parseBearerAuthorization("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(parseBearerAuthorization("Basic x")).toBeNull();

    const keys = await generateEs256KeyPairPem();
    const svc = await createAccessTokenService({
      issuer: "https://api.example.com",
      audience: "aisales-api",
      ttlSeconds: 900,
      active: { kid: "k1", privateKeyPem: keys.privateKeyPem }
    });
    const issued = await svc.issue({
      subject,
      tenantId,
      sessionId,
      actorType: "user",
      membershipId
    });
    const claims = await svc.verify(issued.accessToken);
    const ctx = securityContextFromAccessToken(claims, {
      permissions: ["tenant.read"],
      correlationId: "corr-1",
      tenantTimezone: "Asia/Ho_Chi_Minh"
    });
    expect(ctx.actorId).toBe(subject);
    expect(ctx.tenantId).toBe(tenantId);
    expect(ctx.permissions).toEqual(["tenant.read"]);
    expect(ctx.membershipId).toBe(membershipId);
  });
});
