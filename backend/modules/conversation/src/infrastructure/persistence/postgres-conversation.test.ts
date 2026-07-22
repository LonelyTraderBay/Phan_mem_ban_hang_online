import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresConversationRepository } from "./postgres-conversation.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresConversationRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresConversationRepository(db)).not.toThrow();
  });
});

describeDb("PostgresConversationRepository integration", () => {
  it("listConversations returns array for tenant context", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresConversationRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const page = await repo.listConversations({ tenantId, cursor: null, limit: 50 });
    expect(Array.isArray(page.items)).toBe(true);
    await db.destroy();
  });
});
