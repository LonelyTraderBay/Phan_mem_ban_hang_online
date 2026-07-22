import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresImportRepository } from "./postgres-import.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresImportRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresImportRepository(db)).not.toThrow();
  });
});

describeDb("PostgresImportRepository integration", () => {
  it("listRows returns empty array for unknown job", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresImportRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const jobId = "018f0000-0000-7000-8000-000000000098";
    const rows = await repo.listRows({ tenantId, jobId });
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });
});
