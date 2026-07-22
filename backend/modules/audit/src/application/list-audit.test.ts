import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  createAuditExport,
  InMemoryAuditLogStore,
  listAuditLogs
} from "./list-audit.js";

const tenantId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1b");

describe("BE-IDN-013 audit list/export", () => {
  it("denies list without audit.read", async () => {
    const store = new InMemoryAuditLogStore();
    await expect(
      listAuditLogs({ store, tenantId, actorPermissions: ["tenant.read"] })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });

  it("lists tenant rows and redacts secrets on export", async () => {
    const store = new InMemoryAuditLogStore();
    await store.append({
      id: parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e01"),
      tenant_id: tenantId,
      action: "auth.password.reset",
      actor_id: parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a"),
      correlation_id: "c1",
      payload: { password_hash: "should-not-leak", user_id: "u1" }
    });
    await store.append({
      id: parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e02"),
      tenant_id: parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7cff"),
      action: "other.tenant",
      actor_id: null,
      correlation_id: "",
      payload: {}
    });

    const listed = await listAuditLogs({
      store,
      tenantId,
      actorPermissions: ["audit.read"]
    });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]!.status).toBe("auth.password.reset");

    const exported = await createAuditExport({
      store,
      tenantId,
      actorPermissions: ["audit.export"],
      from: new Date(Date.now() - 60_000).toISOString(),
      to: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: "export-1"
    });
    expect(exported.data.status).toBe("completed");
    expect(exported.redacted_rows[0]!.payload.password_hash).toBe("[redacted]");

    const replay = await createAuditExport({
      store,
      tenantId,
      actorPermissions: ["audit.export"],
      from: new Date(Date.now() - 60_000).toISOString(),
      to: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: "export-1"
    });
    expect(replay.data.job_id).toBe(exported.data.job_id);
  });
});
