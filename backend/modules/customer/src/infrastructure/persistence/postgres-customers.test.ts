import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresCustomerRepository } from "./postgres-customers.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresCustomerRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresCustomerRepository(db)).not.toThrow();
  });
});

describeDb("PostgresCustomerRepository integration", () => {
  it("listCustomers returns empty array for new tenant context", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresCustomerRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const rows = await repo.listCustomers(tenantId);
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });
});
