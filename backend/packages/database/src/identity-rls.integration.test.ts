import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase, withTenantTransaction } from "./index.js";
import { createTenantIsolationFixture, createTestSecurityContext } from "@ai-sales/test-utils";
import { generateUuidV7 } from "@ai-sales/domain-kernel";

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../infra/migrations/000005_identity_schema.sql"
);

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("BE-IDN-001 identity migration artefact", () => {
  it("defines required tables and definitive session RLS policy", () => {
    const sqlText = readFileSync(MIGRATION, "utf8");
    for (const table of [
      "app.tenants",
      "app.users",
      "app.user_credentials",
      "app.tenant_memberships",
      "app.roles",
      "app.permissions",
      "app.role_permissions",
      "app.membership_roles",
      "app.user_sessions",
      "app.refresh_tokens",
      "app.devices",
      "app.invitations",
      "app.mfa_factors",
      "app.recovery_codes",
      "app.support_access_grants"
    ]) {
      expect(sqlText).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sqlText).toContain("user_sessions_actor_tenant_isolation");
    expect(sqlText).toContain("refresh_tokens_actor_tenant_isolation");
    expect(sqlText).toContain("roles_hybrid");
    expect(sqlText).toContain("tenants_tenant_root");
    expect(sqlText).toMatch(/INSERT INTO app\.permissions/i);
    expect(sqlText).not.toMatch(/INSERT INTO app\.tenants/i);
    expect(sqlText).not.toMatch(/INSERT INTO app\.users/i);
  });
});

describeDb("BE-IDN-001 identity RLS (integration)", () => {
  it("denies cross-user session reads and honors nullable-tenant policy", async () => {
    const db = createDatabase(databaseUrl!);
    const { tenantA, tenantB } = createTenantIsolationFixture();
    const deviceA = generateUuidV7();
    const deviceB = generateUuidV7();
    const sessionA = generateUuidV7();
    const sessionB = generateUuidV7();
    const sessionPreTenant = generateUuidV7();

    // Seed as migrator-style: FORCE RLS still binds non-superusers; use set_config + inserts
    // under each actor for devices/sessions owned by that actor.
    await db.transaction().execute(async (trx) => {
      await sql`select set_config('app.actor_id', ${tenantA.actorId}, true)`.execute(trx);
      await sql`select set_config('app.tenant_id', '', true)`.execute(trx);
      await sql`
        insert into app.users (id, primary_email, status)
        values (${tenantA.actorId}::uuid, ${"a-" + tenantA.actorId + "@example.test"}, 'active')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.devices (id, user_id, platform, trusted, trust_status)
        values (${deviceA}::uuid, ${tenantA.actorId}::uuid, 'web', true, 'trusted')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.user_sessions (
          id, user_id, tenant_id, device_id, absolute_expiry, revoked
        ) values (
          ${sessionPreTenant}::uuid, ${tenantA.actorId}::uuid, null,
          ${deviceA}::uuid, now() + interval '1 day', false
        )
        on conflict (id) do nothing
      `.execute(trx);
    });

    await withTenantTransaction(db, tenantA, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (
          ${tenantA.tenantId}::uuid,
          ${"t-a-" + tenantA.tenantId.slice(0, 8)},
          'Tenant A',
          'active'
        )
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.user_sessions (
          id, user_id, tenant_id, device_id, absolute_expiry, revoked
        ) values (
          ${sessionA}::uuid, ${tenantA.actorId}::uuid, ${tenantA.tenantId}::uuid,
          ${deviceA}::uuid, now() + interval '1 day', false
        )
        on conflict (id) do nothing
      `.execute(trx);
    });

    await db.transaction().execute(async (trx) => {
      await sql`select set_config('app.actor_id', ${tenantB.actorId}, true)`.execute(trx);
      await sql`select set_config('app.tenant_id', '', true)`.execute(trx);
      await sql`
        insert into app.users (id, primary_email, status)
        values (${tenantB.actorId}::uuid, ${"b-" + tenantB.actorId + "@example.test"}, 'active')
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.devices (id, user_id, platform, trusted, trust_status)
        values (${deviceB}::uuid, ${tenantB.actorId}::uuid, 'web', true, 'trusted')
        on conflict (id) do nothing
      `.execute(trx);
    });

    await withTenantTransaction(db, tenantB, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (
          ${tenantB.tenantId}::uuid,
          ${"t-b-" + tenantB.tenantId.slice(0, 8)},
          'Tenant B',
          'active'
        )
        on conflict (id) do nothing
      `.execute(trx);
      await sql`
        insert into app.user_sessions (
          id, user_id, tenant_id, device_id, absolute_expiry, revoked
        ) values (
          ${sessionB}::uuid, ${tenantB.actorId}::uuid, ${tenantB.tenantId}::uuid,
          ${deviceB}::uuid, now() + interval '1 day', false
        )
        on conflict (id) do nothing
      `.execute(trx);
    });

    // Cross-user: B cannot see A's session
    const seenByB = await withTenantTransaction(db, tenantB, async (trx) => {
      return sql<{ id: string }>`
        select id from app.user_sessions where id = ${sessionA}::uuid
      `.execute(trx);
    });
    expect(seenByB.rows).toEqual([]);

    // Same user + tenant sees own session
    const seenByA = await withTenantTransaction(db, tenantA, async (trx) => {
      return sql<{ id: string }>`
        select id from app.user_sessions where id = ${sessionA}::uuid
      `.execute(trx);
    });
    expect(seenByA.rows).toHaveLength(1);

    // Pre-tenant session visible to owning actor even with tenant bound
    const preTenant = await withTenantTransaction(db, tenantA, async (trx) => {
      return sql<{ id: string }>`
        select id from app.user_sessions where id = ${sessionPreTenant}::uuid
      `.execute(trx);
    });
    expect(preTenant.rows).toHaveLength(1);

    // Different tenant context on same actor still sees NULL tenant_id rows, not other-tenant rows
    const otherTenantCtx = createTestSecurityContext({
      actorId: tenantA.actorId,
      tenantId: tenantB.tenantId,
      correlationId: "cross-tenant-same-actor"
    });
    const wrongTenant = await withTenantTransaction(db, otherTenantCtx, async (trx) => {
      return sql<{ id: string }>`
        select id from app.user_sessions where id = ${sessionA}::uuid
      `.execute(trx);
    });
    expect(wrongTenant.rows).toEqual([]);

    await db.destroy();
  });
});
