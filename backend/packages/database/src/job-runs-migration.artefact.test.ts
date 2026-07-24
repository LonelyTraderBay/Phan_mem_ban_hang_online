import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../infra/migrations/000041_job_runs.sql"
);

describe("P7 job_runs migration artefact", () => {
  it("defines SYSTEM_INTERNAL job_runs with worker-only grants", () => {
    const sqlText = readFileSync(MIGRATION, "utf8");
    expect(sqlText).toContain("CREATE TABLE IF NOT EXISTS app.job_runs");
    expect(sqlText).toContain("ALTER TABLE app.job_runs FORCE ROW LEVEL SECURITY;");
    expect(sqlText).toMatch(/FOR ALL TO app_worker/);
    expect(sqlText).toMatch(/REVOKE ALL ON app\.job_runs FROM app_runtime/);
    expect(sqlText).toMatch(/GRANT INSERT, UPDATE, SELECT ON app\.job_runs TO app_worker/);
    expect(sqlText).not.toMatch(/tenant_id/);
  });
});
