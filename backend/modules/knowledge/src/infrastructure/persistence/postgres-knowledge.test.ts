import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresKnowledgeRepository } from "./postgres-knowledge.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresKnowledgeRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresKnowledgeRepository(db)).not.toThrow();
  });
});

describeDb("PostgresKnowledgeRepository integration", () => {
  it("listSources returns array for tenant context", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresKnowledgeRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const rows = await repo.listSources(tenantId);
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });
});
