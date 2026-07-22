import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase, withTenantTransaction } from "./index.js";
import { createTenantIsolationFixture } from "@ai-sales/test-utils";
import { generateUuidV7 } from "@ai-sales/domain-kernel";

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../infra/migrations/000016_knowledge_schema.sql"
);

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("BE-KNW-001 knowledge migration artefact", () => {
  it("defines required tables with FORCE RLS and tenant isolation policies", () => {
    const sqlText = readFileSync(MIGRATION, "utf8");
    for (const table of [
      "app.knowledge_sources",
      "app.knowledge_source_versions",
      "app.knowledge_chunks"
    ]) {
      expect(sqlText).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(sqlText).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sqlText).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }
    expect(sqlText).toMatch(/uq_knowledge_source_versions_tenant_source_published/);
    expect(sqlText).toMatch(/REFERENCES app\.knowledge_sources \(id, tenant_id\)/);
    expect(sqlText).toMatch(/REFERENCES app\.knowledge_source_versions \(id, tenant_id\)/);
    expect(sqlText).toMatch(/CHECK \(status IN \('draft', 'in_review', 'approved', 'published', 'archived'\)\)/);
    expect(sqlText).toMatch(/uq_knowledge_chunks_version_index/);
  });
});

describeDb("BE-KNW-001 knowledge RLS (integration)", () => {
  it("denies cross-tenant reads on sources and enforces one published version per source", async () => {
    const db = createDatabase(databaseUrl!);
    const { tenantA, tenantB } = createTenantIsolationFixture();
    const sourceA = generateUuidV7();
    const versionA = generateUuidV7();

    await withTenantTransaction(db, tenantA, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (${tenantA.tenantId}::uuid, ${"knw-a-" + tenantA.tenantId.slice(0, 8)}, 'Tenant A', 'active')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.knowledge_sources (id, tenant_id, name, source_type)
        values (${sourceA}::uuid, ${tenantA.tenantId}::uuid, 'FAQ', 'manual')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.knowledge_source_versions (id, tenant_id, source_id, title, status)
        values (${versionA}::uuid, ${tenantA.tenantId}::uuid, ${sourceA}::uuid, 'FAQ v1', 'published')
        on conflict (id) do nothing
      `.execute(trx);
    });

    await withTenantTransaction(db, tenantB, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (${tenantB.tenantId}::uuid, ${"knw-b-" + tenantB.tenantId.slice(0, 8)}, 'Tenant B', 'active')
        on conflict (id) do nothing
      `.execute(trx);
    });

    const seenByB = await withTenantTransaction(db, tenantB, async (trx) => {
      return sql<{ id: string }>`select id from app.knowledge_sources where id = ${sourceA}::uuid`.execute(trx);
    });
    expect(seenByB.rows).toEqual([]);

    const versionsSeenByB = await withTenantTransaction(db, tenantB, async (trx) => {
      return sql<{ id: string }>`select id from app.knowledge_source_versions where id = ${versionA}::uuid`.execute(trx);
    });
    expect(versionsSeenByB.rows).toEqual([]);

    const seenByA = await withTenantTransaction(db, tenantA, async (trx) => {
      return sql<{ id: string }>`select id from app.knowledge_sources where id = ${sourceA}::uuid`.execute(trx);
    });
    expect(seenByA.rows).toHaveLength(1);

    await expect(
      withTenantTransaction(db, tenantA, async (trx) => {
        await sql`
          insert into app.knowledge_source_versions (id, tenant_id, source_id, title, status)
          values (${generateUuidV7()}::uuid, ${tenantA.tenantId}::uuid, ${sourceA}::uuid, 'FAQ v2', 'published')
        `.execute(trx);
      })
    ).rejects.toBeTruthy();

    await db.destroy();
  });
});
