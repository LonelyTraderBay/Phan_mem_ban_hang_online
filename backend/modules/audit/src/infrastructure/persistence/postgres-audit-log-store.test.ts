import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { createTestSecurityContext, testUuidV7 } from "@ai-sales/test-utils";
import { PostgresAuditLogStore } from "./postgres-audit-log-store.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresAuditLogStore", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresAuditLogStore(db)).not.toThrow();
  });
});

describeDb("PostgresAuditLogStore integration", () => {
  it("list returns array under unknown tenant", async () => {
    const db = createDatabase(databaseUrl!);
    const store = new PostgresAuditLogStore(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const rows = await store.list(tenantId, 10);
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });

  it("append dual-writes audit_events and audit_logs; list reads audit_logs", async () => {
    const db = createDatabase(databaseUrl!);
    const store = new PostgresAuditLogStore(db);
    const ctx = createTestSecurityContext();
    const entryId = testUuidV7("018f65fd-7c80-7c2a-9c8f-46e0f7a1f0a1");

    const appended = await store.append({
      id: entryId,
      tenant_id: ctx.tenantId,
      action: "p5.1.dual_write_probe",
      actor_id: ctx.actorId,
      correlation_id: ctx.correlationId,
      payload: { probe: true }
    });

    expect(appended.id).toBe(entryId);
    expect(appended.action).toBe("p5.1.dual_write_probe");

    const listed = await store.list(ctx.tenantId, 50);
    expect(listed.some((row) => row.id === entryId)).toBe(true);

    const counts = await sql<{ events: string; logs: string }>`
      select
        (select count(*)::text from app.audit_events where id = ${entryId}::uuid) as events,
        (select count(*)::text from app.audit_logs where id = ${entryId}::uuid) as logs
    `.execute(db);
    expect(counts.rows[0]).toEqual({ events: "1", logs: "1" });

    await db.destroy();
  });
});
