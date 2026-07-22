import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PLATFORM_OPS_TENANT, PostgresOperationsRepository } from "./postgres-operations.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresOperationsRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresOperationsRepository(db)).not.toThrow();
  });

  it("exposes PLATFORM_OPS_TENANT constant", () => {
    expect(PLATFORM_OPS_TENANT).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});

describeDb("PostgresOperationsRepository integration", () => {
  it("listTenants returns empty under TENANT_ROOT gap", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresOperationsRepository(db);
    const tenants = await repo.listTenants();
    expect(tenants).toEqual([]);
    await db.destroy();
  });
});
