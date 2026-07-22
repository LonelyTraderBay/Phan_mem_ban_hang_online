import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../infra/migrations");

function isMigrationFile(name: string): boolean {
  return /^\d{6}_.+\.sql$/i.test(name);
}

describe("infra/migrations naming", () => {
  it("uses ordered 000NNN_*.sql filenames without gaps in sort order", async () => {
    const names = (await readdir(MIGRATIONS_DIR)).filter(isMigrationFile).sort((a, b) => a.localeCompare(b));
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(names[0]).toMatch(/^000001_/);
    for (let i = 1; i < names.length; i += 1) {
      expect(names[i]! > names[i - 1]!).toBe(true);
    }
  });
});
