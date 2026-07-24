import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase, purgeEphemeralRows } from "./index.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb("ephemeral TTL purge (integration)", () => {
  it("deletes expired oidc_login_states and keeps active rows", async () => {
    const db = createDatabase(databaseUrl!);
    const expiredHash = `test-purge-expired-${crypto.randomUUID()}`;
    const activeHash = `test-purge-active-${crypto.randomUUID()}`;

    try {
      await sql`
        insert into app.oidc_login_states (
          state_hash, nonce_hash, code_verifier, return_to, expires_at
        ) values (
          ${expiredHash},
          'nonce-hash',
          'code-verifier',
          '/dashboard',
          now() - interval '1 hour'
        )
      `.execute(db);

      await sql`
        insert into app.oidc_login_states (
          state_hash, nonce_hash, code_verifier, return_to, expires_at
        ) values (
          ${activeHash},
          'nonce-hash',
          'code-verifier',
          '/dashboard',
          now() + interval '1 hour'
        )
      `.execute(db);

      const counts = await purgeEphemeralRows(db);

      expect(counts.oidc_login_states).toBeGreaterThanOrEqual(1);

      const remaining = await sql<{ state_hash: string }>`
        select state_hash
        from app.oidc_login_states
        where state_hash in (${expiredHash}, ${activeHash})
      `.execute(db);

      const hashes = remaining.rows.map((r) => r.state_hash);
      expect(hashes).not.toContain(expiredHash);
      expect(hashes).toContain(activeHash);
    } finally {
      await sql`
        delete from app.oidc_login_states
        where state_hash in (${activeHash})
      `.execute(db);
      await db.destroy();
    }
  });
});
