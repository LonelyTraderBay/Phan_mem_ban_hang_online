import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresOrderRepository } from "./postgres-order.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresOrderRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresOrderRepository(db)).not.toThrow();
  });
});

describeDb("PostgresOrderRepository integration", () => {
  it("listOrders returns array for tenant context", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresOrderRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const rows = await repo.listOrders(tenantId);
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });
});
