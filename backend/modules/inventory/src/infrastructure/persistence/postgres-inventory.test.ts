import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresInventoryRepository } from "./postgres-inventory.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresInventoryRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresInventoryRepository(db)).not.toThrow();
  });
});

describeDb("PostgresInventoryRepository integration", () => {
  it("listWarehouses returns array under tenant RLS", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresInventoryRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const rows = await repo.listWarehouses(tenantId);
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });
});
