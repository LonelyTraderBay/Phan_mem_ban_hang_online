import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../infra/migrations/000040_shipping_labels.sql"
);

describe("P6 shipping_labels migration artefact", () => {
  it("defines TENANT_OWNED shipping_labels with FORCE RLS and shipment composite FK", () => {
    const sqlText = readFileSync(MIGRATION, "utf8");
    expect(sqlText).toContain("CREATE TABLE IF NOT EXISTS app.shipping_labels");
    expect(sqlText).toContain("ALTER TABLE app.shipping_labels ENABLE ROW LEVEL SECURITY;");
    expect(sqlText).toContain("ALTER TABLE app.shipping_labels FORCE ROW LEVEL SECURITY;");
    expect(sqlText).toMatch(/REFERENCES app\.shipments \(id, tenant_id\)/);
    expect(sqlText).toMatch(/GRANT SELECT, INSERT ON app\.shipping_labels/);
    expect(sqlText).not.toMatch(/GRANT[^;]*(UPDATE|DELETE)[^;]*ON app\.shipping_labels\b/i);
    expect(sqlText).toMatch(/object_key TEXT NOT NULL/);
  });
});
