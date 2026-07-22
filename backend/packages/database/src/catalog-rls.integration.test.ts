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
  "../../../infra/migrations/000012_catalog_schema.sql"
);

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("BE-CAT-001 catalog migration artefact", () => {
  it("defines required tables with FORCE RLS and tenant isolation policies", () => {
    const sqlText = readFileSync(MIGRATION, "utf8");
    for (const table of [
      "app.categories",
      "app.products",
      "app.product_variants",
      "app.product_media",
      "app.price_history"
    ]) {
      expect(sqlText).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(sqlText).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sqlText).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }
    // Money fields are bigint minor units, never floating point (00-global-invariants.mdc).
    expect(sqlText).toMatch(/price_minor BIGINT NOT NULL/);
    expect(sqlText).toMatch(/cost_minor BIGINT NOT NULL/);
    expect(sqlText).not.toMatch(/price_minor\s+(numeric|float|double|real)\b/i);
    expect(sqlText).not.toMatch(/cost_minor\s+(numeric|float|double|real)\b/i);
    // price_history is an append-only ledger: no UPDATE/DELETE grant for runtime roles.
    expect(sqlText).toMatch(/GRANT SELECT, INSERT ON app\.price_history/);
    expect(sqlText).not.toMatch(/GRANT[^;]*(UPDATE|DELETE)[^;]*ON app\.price_history\b/i);
    // import_jobs/import_job_rows stay with BE-IMP-001, not this ticket.
    expect(sqlText).not.toMatch(/CREATE TABLE[^;]*app\.import_jobs/i);
    expect(sqlText).not.toMatch(/CREATE TABLE[^;]*app\.import_job_rows/i);
    // Composite tenant FKs prevent cross-tenant substitution (00-global-invariants.mdc).
    expect(sqlText).toMatch(/REFERENCES app\.products \(id, tenant_id\)/);
    expect(sqlText).toMatch(/REFERENCES app\.product_variants \(id, tenant_id\)/);
  });
});

describeDb("BE-CAT-001 catalog RLS (integration)", () => {
  it("denies cross-tenant reads on products and enforces active-SKU uniqueness per tenant", async () => {
    const db = createDatabase(databaseUrl!);
    const { tenantA, tenantB } = createTenantIsolationFixture();
    const categoryA = generateUuidV7();
    const productA = generateUuidV7();
    const variantA = generateUuidV7();
    const productB = generateUuidV7();

    await withTenantTransaction(db, tenantA, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (${tenantA.tenantId}::uuid, ${"cat-a-" + tenantA.tenantId.slice(0, 8)}, 'Tenant A', 'active')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.categories (id, tenant_id, name, slug, path)
        values (${categoryA}::uuid, ${tenantA.tenantId}::uuid, 'Root', 'root', '/root')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.products (id, tenant_id, category_id, name, status)
        values (${productA}::uuid, ${tenantA.tenantId}::uuid, ${categoryA}::uuid, 'Product A', 'active')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.product_variants (id, tenant_id, product_id, sku, name, price_minor, cost_minor, status)
        values (${variantA}::uuid, ${tenantA.tenantId}::uuid, ${productA}::uuid, 'SKU-A', 'Variant A', 100000, 60000, 'active')
        on conflict (id) do nothing
      `.execute(trx);
    });

    await withTenantTransaction(db, tenantB, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (${tenantB.tenantId}::uuid, ${"cat-b-" + tenantB.tenantId.slice(0, 8)}, 'Tenant B', 'active')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.products (id, tenant_id, name, status)
        values (${productB}::uuid, ${tenantB.tenantId}::uuid, 'Product B', 'active')
        on conflict (id) do nothing
      `.execute(trx);
      // Same SKU text reused by a different tenant must be allowed (uniqueness is per-tenant).
      await sql`
        insert into app.product_variants (id, tenant_id, product_id, sku, name, price_minor, cost_minor, status)
        values (${generateUuidV7()}::uuid, ${tenantB.tenantId}::uuid, ${productB}::uuid, 'SKU-A', 'Variant B', 50000, 20000, 'active')
        on conflict (id) do nothing
      `.execute(trx);
    });

    const seenByB = await withTenantTransaction(db, tenantB, async (trx) => {
      return sql<{ id: string }>`select id from app.products where id = ${productA}::uuid`.execute(trx);
    });
    expect(seenByB.rows).toEqual([]);

    const variantsSeenByB = await withTenantTransaction(db, tenantB, async (trx) => {
      return sql<{ id: string }>`select id from app.product_variants where id = ${variantA}::uuid`.execute(trx);
    });
    expect(variantsSeenByB.rows).toEqual([]);

    const seenByA = await withTenantTransaction(db, tenantA, async (trx) => {
      return sql<{ id: string }>`select id from app.products where id = ${productA}::uuid`.execute(trx);
    });
    expect(seenByA.rows).toHaveLength(1);

    // Duplicate active SKU within the SAME tenant is rejected by the partial unique index.
    await expect(
      withTenantTransaction(db, tenantA, async (trx) => {
        await sql`
          insert into app.product_variants (id, tenant_id, product_id, sku, name, price_minor, cost_minor, status)
          values (${generateUuidV7()}::uuid, ${tenantA.tenantId}::uuid, ${productA}::uuid, 'SKU-A', 'Dup', 1, 0, 'active')
        `.execute(trx);
      })
    ).rejects.toBeTruthy();

    await db.destroy();
  });
});
