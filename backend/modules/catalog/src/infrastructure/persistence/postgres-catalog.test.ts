import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresCatalogRepository } from "./postgres-catalog.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresCatalogRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresCatalogRepository(db)).not.toThrow();
  });
});

describeDb("PostgresCatalogRepository integration", () => {
  it("listCategories returns array under tenant RLS", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresCatalogRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const rows = await repo.listCategories(tenantId);
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });
});
