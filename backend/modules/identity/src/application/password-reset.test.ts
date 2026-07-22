import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { hashPassword, verifyPassword } from "./crypto-auth.js";
import { requestPasswordReset, resetPassword } from "./password-reset.js";
import { InMemorySessionAuthRepository } from "../infrastructure/persistence/in-memory-oidc.js";

const userId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a");
const tenantId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1b");
const membershipId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1c");

describe("BE-IDN-007 password reset", () => {
  async function seedPasswordUser() {
    const store = new InMemorySessionAuthRepository();
    const passwordHash = await hashPassword("old-password-1");
    store.seedTenantUser({
      user: { id: userId, primaryEmail: "local@acme.test", locale: "vi-VN", status: "active" },
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
        displayName: "Local",
        permissions: ["tenant.read"]
      },
      passwordHash
    });
    return store;
  }

  it("forgot is enumeration-safe for unknown email", async () => {
    const store = await seedPasswordUser();
    const unknown = await requestPasswordReset({
      store,
      email: "nobody@acme.test",
      recordPlainToken: (e, t) => store.lastPlainResetTokenByEmail.set(e, t)
    });
    const known = await requestPasswordReset({
      store,
      email: "local@acme.test",
      recordPlainToken: (e, t) => store.lastPlainResetTokenByEmail.set(e, t)
    });
    expect(unknown).toEqual(known);
    expect(store.peekLastPlainToken("nobody@acme.test")).toBeUndefined();
    expect(store.peekLastPlainToken("local@acme.test")).toBeTruthy();
  });

  it("reset once then reject reuse", async () => {
    const store = await seedPasswordUser();
    await requestPasswordReset({
      store,
      email: "local@acme.test",
      recordPlainToken: (e, t) => store.lastPlainResetTokenByEmail.set(e, t)
    });
    const token = store.peekLastPlainToken("local@acme.test")!;
    await resetPassword({ store, token, newPassword: "new-password-9" });
    await expect(resetPassword({ store, token, newPassword: "another-pass-1" })).rejects.toMatchObject({
      code: "AUTH_UNAUTHORIZED"
    });
    const hash = store.passwordCredentials.get("local@acme.test")!.passwordHash;
    expect(await verifyPassword(hash, "new-password-9")).toBe(true);
  });

  it("rejects expired token", async () => {
    const store = await seedPasswordUser();
    const past = new Date(Date.now() - 60_000);
    await requestPasswordReset({
      store,
      email: "local@acme.test",
      tokenTtlMinutes: 0,
      now: past,
      recordPlainToken: (e, t) => store.lastPlainResetTokenByEmail.set(e, t)
    });
    // Force expiry on stored row
    for (const row of store.passwordResetTokens.values()) {
      row.expiresAt = past;
    }
    const token = store.peekLastPlainToken("local@acme.test")!;
    await expect(resetPassword({ store, token, newPassword: "new-password-9" })).rejects.toMatchObject({
      code: "AUTH_UNAUTHORIZED"
    });
  });
});
