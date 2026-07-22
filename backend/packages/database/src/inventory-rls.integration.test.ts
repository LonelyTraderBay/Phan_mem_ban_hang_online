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
  "../../../infra/migrations/000015_inventory_schema.sql"
);

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("BE-INV-001 inventory migration artefact", () => {
  it("defines required tables with FORCE RLS and tenant isolation policies", () => {
    const sqlText = readFileSync(MIGRATION, "utf8");
    for (const table of [
      "app.warehouses",
      "app.inventory_balances",
      "app.inventory_movements",
      "app.inventory_reservations",
      "app.inventory_reservation_items",
      "app.inventory_adjustments"
    ]) {
      expect(sqlText).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(sqlText).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sqlText).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }
    expect(sqlText).toMatch(/on_hand NUMERIC\(18,\s*6\)/);
    expect(sqlText).not.toMatch(/on_hand\s+(float|double|real)\b/i);
    expect(sqlText).toMatch(/uq_inventory_balances_tenant_wh_variant/);
    expect(sqlText).toMatch(/CHECK \(on_hand >= 0\)/);
    expect(sqlText).toMatch(/GRANT SELECT, INSERT ON app\.inventory_movements/);
    expect(sqlText).not.toMatch(/GRANT[^;]*(UPDATE|DELETE)[^;]*ON app\.inventory_movements\b/i);
    expect(sqlText).toMatch(/REFERENCES app\.warehouses \(id, tenant_id\)/);
    expect(sqlText).toMatch(/REFERENCES app\.product_variants \(id, tenant_id\)/);
  });
});

describeDb("BE-INV-001 inventory RLS (integration)", () => {
  it("denies cross-tenant reads on warehouses and enforces balance uniqueness per tenant", async () => {
    const db = createDatabase(databaseUrl!);
    const { tenantA, tenantB } = createTenantIsolationFixture();
    const warehouseA = generateUuidV7();
    const categoryA = generateUuidV7();
    const productA = generateUuidV7();
    const variantA = generateUuidV7();
    const balanceA = generateUuidV7();

    await withTenantTransaction(db, tenantA, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (${tenantA.tenantId}::uuid, ${"inv-a-" + tenantA.tenantId.slice(0, 8)}, 'Tenant A', 'active')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.warehouses (id, tenant_id, code, name, status)
        values (${warehouseA}::uuid, ${tenantA.tenantId}::uuid, 'WH-A', 'Warehouse A', 'active')
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
        values (${variantA}::uuid, ${tenantA.tenantId}::uuid, ${productA}::uuid, 'SKU-INV-A', 'Variant A', 100000, 60000, 'active')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.inventory_balances (id, tenant_id, warehouse_id, variant_id, on_hand)
        values (${balanceA}::uuid, ${tenantA.tenantId}::uuid, ${warehouseA}::uuid, ${variantA}::uuid, 10)
        on conflict (id) do nothing
      `.execute(trx);
    });

    await withTenantTransaction(db, tenantB, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (${tenantB.tenantId}::uuid, ${"inv-b-" + tenantB.tenantId.slice(0, 8)}, 'Tenant B', 'active')
        on conflict (id) do nothing
      `.execute(trx);
    });

    const seenByB = await withTenantTransaction(db, tenantB, async (trx) => {
      return sql<{ id: string }>`select id from app.warehouses where id = ${warehouseA}::uuid`.execute(trx);
    });
    expect(seenByB.rows).toEqual([]);

    const balancesSeenByB = await withTenantTransaction(db, tenantB, async (trx) => {
      return sql<{ id: string }>`select id from app.inventory_balances where id = ${balanceA}::uuid`.execute(trx);
    });
    expect(balancesSeenByB.rows).toEqual([]);

    const seenByA = await withTenantTransaction(db, tenantA, async (trx) => {
      return sql<{ id: string }>`select id from app.warehouses where id = ${warehouseA}::uuid`.execute(trx);
    });
    expect(seenByA.rows).toHaveLength(1);

    await expect(
      withTenantTransaction(db, tenantA, async (trx) => {
        await sql`
          insert into app.inventory_balances (id, tenant_id, warehouse_id, variant_id, on_hand)
          values (${generateUuidV7()}::uuid, ${tenantA.tenantId}::uuid, ${warehouseA}::uuid, ${variantA}::uuid, 5)
        `.execute(trx);
      })
    ).rejects.toBeTruthy();

    await db.destroy();
  });
});
