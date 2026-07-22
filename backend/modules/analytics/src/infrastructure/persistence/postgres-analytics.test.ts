import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresAnalyticsRepository } from "./postgres-analytics.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresAnalyticsRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresAnalyticsRepository(db)).not.toThrow();
  });
});

describeDb("PostgresAnalyticsRepository integration", () => {
  it("listEvents returns array for tenant context", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresAnalyticsRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const rows = await repo.listEvents(tenantId, 10);
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });
});
