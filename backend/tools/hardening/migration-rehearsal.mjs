/**
 * BE-HRD-005 — Migration rehearsal (expand-only dry-run helper).
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

export function listPendingMigrations(migrationsDir) {
  return readdirSync(migrationsDir)
    .filter((f) => /^\d{6}_.+\.sql$/.test(f))
    .sort();
}

export function rehearsalPlan(migrationsDir) {
  const files = listPendingMigrations(migrationsDir);
  return {
    mode: "expand-only",
    migrations: files,
    rollback: "disable route / feature flag — no destructive down"
  };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const dir = join(process.cwd(), "infra", "migrations");
  console.log(JSON.stringify(rehearsalPlan(dir), null, 2));
}
