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
  "../../../infra/migrations/000017_channel_schema.sql"
);

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("BE-CHN-002 channel migration artefact", () => {
  it("defines required tables with FORCE RLS and tenant isolation policies", () => {
    const sqlText = readFileSync(MIGRATION, "utf8");
    for (const table of [
      "app.channel_accounts",
      "app.channel_credentials",
      "app.channel_oauth_states",
      "app.webhook_events",
      "app.outbound_messages",
      "app.outbound_delivery_attempts"
    ]) {
      expect(sqlText).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(sqlText).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sqlText).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }
    expect(sqlText).toMatch(/uq_channel_accounts_tenant_provider_external/);
    expect(sqlText).toMatch(/uq_webhook_events_dedupe/);
    expect(sqlText).toMatch(/REFERENCES app\.channel_accounts \(id, tenant_id\)/);
    expect(sqlText).toMatch(/CHECK \(status IN \('queued', 'sending', 'sent', 'blocked', 'failed', 'cancelled'\)\)/);
  });
});

describeDb("BE-CHN-002 channel RLS (integration)", () => {
  it("denies cross-tenant reads on channel accounts", async () => {
    const db = createDatabase(databaseUrl!);
    const { tenantA, tenantB } = createTenantIsolationFixture();
    const accountA = generateUuidV7();

    await withTenantTransaction(db, tenantA, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (${tenantA.tenantId}::uuid, ${"chn-a-" + tenantA.tenantId.slice(0, 8)}, 'Tenant A', 'active')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.channel_accounts (id, tenant_id, provider, external_account_id, status)
        values (${accountA}::uuid, ${tenantA.tenantId}::uuid, 'facebook', 'page-1', 'active')
        on conflict (id) do nothing
      `.execute(trx);
    });

    await withTenantTransaction(db, tenantB, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (${tenantB.tenantId}::uuid, ${"chn-b-" + tenantB.tenantId.slice(0, 8)}, 'Tenant B', 'active')
        on conflict (id) do nothing
      `.execute(trx);
    });

    const seenByB = await withTenantTransaction(db, tenantB, async (trx) => {
      return sql<{ id: string }>`select id from app.channel_accounts where id = ${accountA}::uuid`.execute(trx);
    });
    expect(seenByB.rows).toEqual([]);

    const seenByA = await withTenantTransaction(db, tenantA, async (trx) => {
      return sql<{ id: string }>`select id from app.channel_accounts where id = ${accountA}::uuid`.execute(trx);
    });
    expect(seenByA.rows).toHaveLength(1);

    await db.destroy();
  });
});
