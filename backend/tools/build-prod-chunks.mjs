import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "infra", "migrations");
const files = (await readdir(dir))
  .filter((f) => /^\d{6}_.+\.sql$/i.test(f))
  .sort((a, b) => a.localeCompare(b))
  .filter((f) => f !== "000001_bootstrap_roles.sql");

const chunkSize = 8;
for (let i = 0; i < files.length; i += chunkSize) {
  const chunk = files.slice(i, i + chunkSize);
  let out = "";
  for (const f of chunk) {
    out += `\n-- >>> ${f}\n`;
    out += await readFile(path.join(dir, f), "utf8");
    out += `\nINSERT INTO app.schema_migrations (version) VALUES ('${f}') ON CONFLICT DO NOTHING;\n`;
  }
  const idx = Math.floor(i / chunkSize) + 2;
  const name = `chunk_${String(idx).padStart(2, "0")}`;
  const dest = path.join(root, "tools", `_prod_${name}.sql`);
  await writeFile(dest, out, "utf8");
  console.log(JSON.stringify({ name, count: chunk.length, bytes: out.length, from: chunk[0], to: chunk.at(-1) }));
}
