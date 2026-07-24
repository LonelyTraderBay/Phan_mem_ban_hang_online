import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "infra", "migrations");
const files = (await readdir(dir))
  .filter((f) => /^\d{6}_.+\.sql$/i.test(f))
  .sort((a, b) => a.localeCompare(b));

let out =
  "CREATE SCHEMA IF NOT EXISTS app;\n" +
  "CREATE TABLE IF NOT EXISTS app.schema_migrations (\n" +
  "  version TEXT PRIMARY KEY,\n" +
  "  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()\n" +
  ");\n";

for (const f of files) {
  out += `\n-- >>> BEGIN ${f}\n`;
  out += await readFile(path.join(dir, f), "utf8");
  out += `\nINSERT INTO app.schema_migrations (version) VALUES ('${f}') ON CONFLICT DO NOTHING;\n`;
  out += `-- <<< END ${f}\n`;
}

const dest = path.join(root, "tools", "_prod_bootstrap_all.sql");
await writeFile(dest, out, "utf8");
console.log(JSON.stringify({ files: files.length, bytes: out.length, dest }));
