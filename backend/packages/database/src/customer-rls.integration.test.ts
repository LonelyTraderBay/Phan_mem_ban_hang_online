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
  "../../../infra/migrations/000011_customer_schema.sql"
);

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("BE-CUS-001 customer migration artefact", () => {
  it("defines required tables with FORCE RLS and tenant isolation policies", () => {
    const sqlText = readFileSync(MIGRATION, "utf8");
    for (const table of [
      "app.customers",
      "app.customer_tags",
      "app.customer_identities",
      "app.customer_addresses",
      "app.customer_tag_links",
      "app.customer_consents",
      "app.customer_notes",
      "app.customer_merge_history"
    ]) {
      expect(sqlText).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(sqlText).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sqlText).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }
    // PII ciphertext + blind index columns (blueprint §7.6.1, §12.4) — never plaintext/unsalted hash.
    expect(sqlText).toContain("phone_encrypted BYTEA");
    expect(sqlText).toContain("phone_blind_index TEXT");
    expect(sqlText).toContain("email_encrypted BYTEA");
    expect(sqlText).toContain("email_blind_index TEXT");
    expect(sqlText).toContain("receiver_name_encrypted BYTEA");
    // No hard-delete of the customer aggregate itself.
    expect(sqlText).not.toMatch(/GRANT[^;]*DELETE[^;]*ON app\.customers\b/i);
    // Composite tenant FKs prevent cross-tenant substitution (00-global-invariants.mdc).
    expect(sqlText).toMatch(/REFERENCES app\.customers \(id, tenant_id\)/);
  });
});

describeDb("BE-CUS-001 customer RLS (integration)", () => {
  it("denies cross-tenant reads on customers and customer_notes", async () => {
    const db = createDatabase(databaseUrl!);
    const { tenantA, tenantB } = createTenantIsolationFixture();
    const customerA = generateUuidV7();
    const customerB = generateUuidV7();
    const noteA = generateUuidV7();

    await withTenantTransaction(db, tenantA, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (${tenantA.tenantId}::uuid, ${"cus-a-" + tenantA.tenantId.slice(0, 8)}, 'Tenant A', 'active')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.customers (id, tenant_id, display_name, status)
        values (${customerA}::uuid, ${tenantA.tenantId}::uuid, 'Customer A', 'active')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.customer_notes (id, tenant_id, customer_id, author_id, body)
        values (${noteA}::uuid, ${tenantA.tenantId}::uuid, ${customerA}::uuid, ${tenantA.actorId}::uuid, 'note body')
        on conflict (id) do nothing
      `.execute(trx);
    });

    await withTenantTransaction(db, tenantB, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (${tenantB.tenantId}::uuid, ${"cus-b-" + tenantB.tenantId.slice(0, 8)}, 'Tenant B', 'active')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.customers (id, tenant_id, display_name, status)
        values (${customerB}::uuid, ${tenantB.tenantId}::uuid, 'Customer B', 'active')
        on conflict (id) do nothing
      `.execute(trx);
    });

    const customersSeenByB = await withTenantTransaction(db, tenantB, async (trx) => {
      return sql<{ id: string }>`select id from app.customers where id = ${customerA}::uuid`.execute(trx);
    });
    expect(customersSeenByB.rows).toEqual([]);

    const notesSeenByB = await withTenantTransaction(db, tenantB, async (trx) => {
      return sql<{ id: string }>`select id from app.customer_notes where id = ${noteA}::uuid`.execute(trx);
    });
    expect(notesSeenByB.rows).toEqual([]);

    const customersSeenByA = await withTenantTransaction(db, tenantA, async (trx) => {
      return sql<{ id: string }>`select id from app.customers where id = ${customerA}::uuid`.execute(trx);
    });
    expect(customersSeenByA.rows).toHaveLength(1);

    // Cross-tenant FK substitution is rejected even for the owning tenant's own INSERT.
    await expect(
      withTenantTransaction(db, tenantA, async (trx) => {
        await sql`
          insert into app.customer_notes (id, tenant_id, customer_id, author_id, body)
          values (${generateUuidV7()}::uuid, ${tenantA.tenantId}::uuid, ${customerB}::uuid, ${tenantA.actorId}::uuid, 'x')
        `.execute(trx);
      })
    ).rejects.toBeTruthy();

    await db.destroy();
  });
});
