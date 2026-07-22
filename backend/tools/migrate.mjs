#!/usr/bin/env node
/**
 * Applies infra/migrations/*.sql in lexicographic order, tracking app.schema_migrations.
 * Usage: DATABASE_URL=... node tools/migrate.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "infra", "migrations");

export function isMigrationFile(name) {
  return /^\d{6}_.+\.sql$/i.test(name);
}

export function sortMigrationFiles(names) {
  return names.filter(isMigrationFile).sort((a, b) => a.localeCompare(b));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS app;
    CREATE TABLE IF NOT EXISTS app.schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function appliedVersions(client) {
  const result = await client.query("SELECT version FROM app.schema_migrations ORDER BY version");
  return new Set(result.rows.map((row) => row.version));
}

export async function listPendingMigrations(dir = MIGRATIONS_DIR, applied = new Set()) {
  const names = sortMigrationFiles(await readdir(dir));
  return names.filter((name) => !applied.has(name));
}

async function applyMigration(client, dir, filename) {
  const sql = await readFile(path.join(dir, filename), "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO app.schema_migrations (version) VALUES ($1)", [filename]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await appliedVersions(client);
    const pending = await listPendingMigrations(MIGRATIONS_DIR, applied);
    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }
    for (const filename of pending) {
      process.stdout.write(`Applying ${filename}... `);
      await applyMigration(client, MIGRATIONS_DIR, filename);
      console.log("ok");
    }
    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
