import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
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
});
