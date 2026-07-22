import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresAiOrchestrationRepository } from "./postgres-ai-orchestration.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresAiOrchestrationRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresAiOrchestrationRepository(db)).not.toThrow();
  });
});

describeDb("PostgresAiOrchestrationRepository integration", () => {
  it("listLogs returns array for tenant context", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresAiOrchestrationRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const rows = await repo.listLogs(tenantId);
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });
});
