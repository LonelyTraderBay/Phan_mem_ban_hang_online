import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresMembersRolesRepository } from "./postgres-members-roles.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("PostgresMembersRolesRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresMembersRolesRepository(db)).not.toThrow();
  });
});

describeDb("PostgresMembersRolesRepository integration", () => {
  it("listMembers returns array under unknown tenant", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresMembersRolesRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const rows = await repo.listMembers(tenantId);
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });
});
