import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  createSupportAccess,
  InMemorySupportGrantStore
} from "./support-grant.js";

const tenantId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a");
const granteeId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c2a");

describe("BE-IDN-014 support access grant", () => {
  it("creates grant, audits use, denies expired and over-scope", async () => {
    const store = new InMemorySupportGrantStore();
    const created = await createSupportAccess({
      store,
      actorPermissions: ["support.access"],
      actorUserId: actorId,
      tenantId,
      granteeUserId: granteeId,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      reason: "ticket-42 break-glass",
      scope: "read"
    });
    expect(created.data.status).toBe("active");
    expect(store.auditTrail.some((a) => a.action === "support.grant.create")).toBe(true);

    await store.assertUsable({
      grantId: created.data.id,
      tenantId,
      actorUserId: granteeId,
      requiredScope: "read"
    });
    expect(store.auditTrail.some((a) => a.action === "support.grant.use")).toBe(true);

    await expect(
      store.assertUsable({
        grantId: created.data.id,
        tenantId,
        actorUserId: granteeId,
        requiredScope: "admin"
      })
    ).rejects.toMatchObject({ code: "SUPPORT_SCOPE_DENIED" });

    const expired = await createSupportAccess({
      store,
      actorPermissions: ["support.access"],
      actorUserId: actorId,
      tenantId,
      granteeUserId: granteeId,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      reason: "short",
      scope: "write"
    });
    await expect(
      store.assertUsable({
        grantId: expired.data.id,
        tenantId,
        actorUserId: granteeId,
        requiredScope: "write",
        now: new Date(Date.now() + 120_000)
      })
    ).rejects.toMatchObject({ code: "SUPPORT_GRANT_EXPIRED" });
  });

  it("requires support.access permission", async () => {
    const store = new InMemorySupportGrantStore();
    await expect(
      createSupportAccess({
        store,
        actorPermissions: ["tenant.read"],
        actorUserId: actorId,
        tenantId,
        granteeUserId: granteeId,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        reason: "nope"
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });
});
