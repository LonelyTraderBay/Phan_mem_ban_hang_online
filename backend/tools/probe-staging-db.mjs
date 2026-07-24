import fs from "node:fs";
import pg from "pg";

const pw = fs.readFileSync(new URL("../.staging-db-pass", import.meta.url), "utf8").trim();
const ref = "lrcsbrmqlyvkxxspbezi";
const hosts = [
  "aws-1-ap-southeast-1.pooler.supabase.com",
  "aws-0-ap-southeast-1.pooler.supabase.com",
];
const users = [`ais_staging_api.${ref}`, "ais_staging_api", `postgres.${ref}`];
const ports = [6543, 5432];

for (const host of hosts) {
  for (const port of ports) {
    for (const user of users) {
      const url = `postgres://${user}:${encodeURIComponent(pw)}@${host}:${port}/postgres`;
      const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
      try {
        await c.connect();
        const r = await c.query("select current_user u, count(*)::int n from app.schema_migrations");
        console.log("DB_OK", host, port, user, r.rows[0]);
        fs.writeFileSync(new URL("../.staging-database-url", import.meta.url), url + "\n", { mode: 0o600 });
        console.log("WROTE .staging-database-url");
        await c.end();
        process.exit(0);
      } catch (e) {
        console.log("FAIL", host, port, user, (e.message || "").slice(0, 120));
        try {
          await c.end();
        } catch {
          /* ignore */
        }
      }
    }
  }
}
process.exit(1);
