import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresFulfillmentRepository } from "./postgres-fulfillment.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresFulfillmentRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresFulfillmentRepository(db)).not.toThrow();
  });
});

describeDb("PostgresFulfillmentRepository integration", () => {
  it("getShipment returns null for unknown id", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresFulfillmentRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const shipmentId = "018f0000-0000-7000-8000-000000000096";
    const row = await repo.getShipment({ tenantId, shipmentId });
    expect(row).toBeNull();
    await db.destroy();
  });
});
