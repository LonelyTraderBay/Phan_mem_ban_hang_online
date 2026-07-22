import { describe, expect, it } from "vitest";
import { acceptInvitation, AcceptInvitationError, type InvitationAcceptStore } from "./accept-invitation.js";

function memoryInviteStore(): InvitationAcceptStore & {
  consume: (hash: string) => void;
} {
  const pending = new Map<string, true>();
  return {
    consume(hash: string) {
      pending.set(hash, true);
    },
    async acceptInvitation(args) {
      if (!pending.has(args.tokenHash)) {
        if ([...pending.keys()].length === 0) {
          // after accept, reuse
        }
        // First call: treat unknown as... we'll set before call
      }
      if (!pending.has(args.tokenHash)) {
        return { outcome: "INVITE_ALREADY_ACCEPTED" };
      }
      pending.delete(args.tokenHash);
      return {
        outcome: "ok",
        tenantId: "018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1b",
        userId: "018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a",
        membershipId: "018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1c",
        email: "join@acme.test",
        displayName: "Join",
        roleIds: [],
        permissions: ["tenant.read"]
      };
    }
  };
}

describe("acceptInvitation (BE-IDN-010)", () => {
  it("returns AuthResponse shape and rejects reuse", async () => {
    const { createHash } = await import("node:crypto");
    const token = "a".repeat(32);
    const hash = createHash("sha256").update(token, "utf8").digest("hex");
    const store = memoryInviteStore();
    store.consume(hash);

    const ok = await acceptInvitation({
      store,
      token,
      password: "password12"
    });
    expect(ok.body.data.mfa_required).toBe(false);
    expect(ok.body.data.access_token).toBeNull();

    await expect(acceptInvitation({ store, token })).rejects.toBeInstanceOf(AcceptInvitationError);
    await expect(acceptInvitation({ store, token })).rejects.toMatchObject({
      code: "INVITE_ALREADY_ACCEPTED"
    });
  });
});
