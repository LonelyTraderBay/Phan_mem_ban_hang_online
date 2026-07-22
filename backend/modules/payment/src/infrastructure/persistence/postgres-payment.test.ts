import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresPaymentRepository } from "./postgres-payment.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresPaymentRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresPaymentRepository(db)).not.toThrow();
  });
});

describeDb("PostgresPaymentRepository integration", () => {
  it("listPaymentsByOrder returns array for tenant context", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresPaymentRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const orderId = "018f0000-0000-7000-8000-000000000097";
    const rows = await repo.listPaymentsByOrder({ tenantId, orderId });
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });
});
