#!/usr/bin/env node
/**
 * Idempotent local/dev seed: tenant `dev` + owner@dev.local + Owner role + sample catalog/customers.
 *
 * Usage:
 *   DATABASE_URL=... node tools/seed-dev-tenant.mjs
 *   DATABASE_URL=... SEED_MIGRATE=1 node tools/seed-dev-tenant.mjs
 *
 * Fixed IDs (documented for FE e2e / .env.local):
 *   tenant: 01900000-0000-7000-8000-00000000a100
 *   user:   01900000-0000-7000-8000-00000000b100  (owner@dev.local)
 *   role:   01900000-0000-7000-8000-00000000d100
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TENANT_ID = "01900000-0000-7000-8000-00000000a100";
const USER_ID = "01900000-0000-7000-8000-00000000b100";
const MEMBERSHIP_ID = "01900000-0000-7000-8000-00000000c100";
const ROLE_ID = "01900000-0000-7000-8000-00000000d100";
const MEMBERSHIP_ROLE_ID = "01900000-0000-7000-8000-00000000e100";
const OWNER_EMAIL = "owner@dev.local";

function requireEnv(name) {
  const value = process.env[name];
  if (!value?.trim()) {
    console.error(`${name} is required`);
    process.exit(1);
  }
  return value.trim();
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");

  if (process.env.SEED_MIGRATE === "1") {
    console.log("Applying pending migrations...");
    const migrate = spawnSync(process.execPath, [path.join(ROOT, "tools", "migrate.mjs")], {
      env: process.env,
      stdio: "inherit",
    });
    if (migrate.status !== 0) process.exit(migrate.status ?? 1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER EXTENSION citext SET SCHEMA app`).catch(() => {});
    await client.query(`SET search_path TO app, public`);

    await client.query(
      `
      INSERT INTO app.tenants (
        id, code, name, status, timezone, currency, locale,
        permission_version, version, created_at, updated_at, metadata
      ) VALUES (
        $1::uuid, 'dev', 'Dev Tenant', 'active', 'Asia/Ho_Chi_Minh', 'VND', 'vi-VN',
        1, 1, now(), now(), '{}'::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now()
      `,
      [TENANT_ID],
    );

    await client.query(
      `
      INSERT INTO app.users (
        id, primary_email, status, locale, version, created_at, updated_at, metadata, email_verified_at
      ) VALUES (
        $1::uuid, $2, 'active', 'vi-VN', 1, now(), now(), '{}'::jsonb, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        primary_email = EXCLUDED.primary_email,
        status = 'active',
        email_verified_at = coalesce(app.users.email_verified_at, now()),
        updated_at = now()
      `,
      [USER_ID, OWNER_EMAIL],
    );

    await client.query(
      `
      INSERT INTO app.tenant_memberships (
        id, tenant_id, user_id, status, display_name, version, created_at, updated_at, metadata, activated_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, 'active', 'Dev Owner', 1, now(), now(), '{}'::jsonb, now()
      )
      ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now()
      `,
      [MEMBERSHIP_ID, TENANT_ID, USER_ID],
    );

    await client.query(
      `
      INSERT INTO app.roles (
        id, tenant_id, name, description, is_system, created_at, updated_at, metadata
      ) VALUES (
        $1::uuid, $2::uuid, 'Owner', 'Dev tenant owner (full permissions)', false, now(), now(), '{}'::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
      `,
      [ROLE_ID, TENANT_ID],
    );

    await client.query(
      `
      INSERT INTO app.membership_roles (id, membership_id, role_id, tenant_id, created_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())
      ON CONFLICT DO NOTHING
      `,
      [MEMBERSHIP_ROLE_ID, MEMBERSHIP_ID, ROLE_ID, TENANT_ID],
    );

    await client.query(
      `
      INSERT INTO app.role_permissions (role_id, permission_key, created_at)
      SELECT $1::uuid, p.key, now()
      FROM app.permissions p
      ON CONFLICT DO NOTHING
      `,
      [ROLE_ID],
    );

    // Optional sample rows — ignore if schema columns differ slightly.
    const productId = "01900000-0000-7000-8000-00000000f101";
    const customerId = "01900000-0000-7000-8000-00000000f201";
    try {
      await client.query(
        `
        INSERT INTO app.products (id, tenant_id, name, status, version, created_at, updated_at, metadata)
        VALUES ($1::uuid, $2::uuid, 'Dev Sample Product', 'active', 1, now(), now(), '{}'::jsonb)
        ON CONFLICT (id) DO NOTHING
        `,
        [productId, TENANT_ID],
      );
    } catch (e) {
      console.warn("skip products seed:", e.message?.slice(0, 120) ?? e);
    }
    try {
      await client.query(
        `
        INSERT INTO app.customers (id, tenant_id, display_name, status, version, created_at, updated_at, metadata)
        VALUES ($1::uuid, $2::uuid, 'Dev Sample Customer', 'active', 1, now(), now(), '{}'::jsonb)
        ON CONFLICT (id) DO NOTHING
        `,
        [customerId, TENANT_ID],
      );
    } catch (e) {
      console.warn("skip customers seed:", e.message?.slice(0, 120) ?? e);
    }

    await client.query("COMMIT");

    console.log("seed-dev-tenant OK");
    console.log(
      JSON.stringify(
        {
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          role_id: ROLE_ID,
          email: OWNER_EMAIL,
          tenant_code: "dev",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
