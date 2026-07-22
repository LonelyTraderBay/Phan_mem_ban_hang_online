import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresChannelRepository } from "./postgres-channel.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresChannelRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresChannelRepository(db)).not.toThrow();
  });
});

describeDb("PostgresChannelRepository integration", () => {
  it("listAccounts returns array for tenant context", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresChannelRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const rows = await repo.listAccounts(tenantId);
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });
});
