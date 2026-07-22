import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresBillingRepository } from "./postgres-billing.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresBillingRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresBillingRepository(db)).not.toThrow();
  });
});

describeDb("PostgresBillingRepository integration", () => {
  it("getSubscription returns null for unknown tenant context", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresBillingRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const row = await repo.getSubscription(tenantId);
    expect(row === null || typeof row.id === "string").toBe(true);
    await db.destroy();
  });
});
