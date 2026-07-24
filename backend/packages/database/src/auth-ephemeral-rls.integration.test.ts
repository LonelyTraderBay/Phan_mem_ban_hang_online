import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "./index.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb("auth ephemeral RLS hardening (integration)", () => {
  it("denies direct table access as app_runtime but allows SECURITY DEFINER OIDC helpers", async () => {
    const db = createDatabase(databaseUrl!);
    const stateHash = `rls-test-${crypto.randomUUID()}`;

    try {
      await expect(
        db.transaction().execute(async (trx) => {
          await sql`set local role app_runtime`.execute(trx);
          await sql`select count(*)::int as c from app.oidc_login_states`.execute(trx);
        })
      ).rejects.toMatchObject({ code: "42501" });

      await db.transaction().execute(async (trx) => {
        await sql`set local role app_runtime`.execute(trx);

        await sql`
          select app.oidc_save_login_state(
            ${stateHash},
            'nonce-hash',
            'code-verifier',
            '/dashboard',
            null,
            null,
            now() + interval '15 minutes'
          )
        `.execute(trx);

        const consumed = await sql<{
          nonce_hash: string;
          return_to: string;
        }>`
          select nonce_hash, return_to
          from app.oidc_consume_login_state(${stateHash})
        `.execute(trx);

        expect(consumed.rows).toHaveLength(1);
        expect(consumed.rows[0]?.return_to).toBe("/dashboard");
      });
    } finally {
      await sql`
        delete from app.oidc_login_states where state_hash = ${stateHash}
      `.execute(db);
      await db.destroy();
    }
  });

  it("allows app_worker purge via SECURITY DEFINER without direct table grants", async () => {
    const db = createDatabase(databaseUrl!);
    const expiredHash = `rls-purge-${crypto.randomUUID()}`;

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

      await expect(
        db.transaction().execute(async (trx) => {
          await sql`set local role app_worker`.execute(trx);
          await sql`select count(*)::int as c from app.oidc_login_states`.execute(trx);
        })
      ).rejects.toMatchObject({ code: "42501" });

      const purged = await db.transaction().execute(async (trx) => {
        await sql`set local role app_worker`.execute(trx);
        const result = await sql<{ purge_ephemeral_rows: { oidc_login_states: number } }>`
          select app.purge_ephemeral_rows() as purge_ephemeral_rows
        `.execute(trx);
        return result.rows[0]?.purge_ephemeral_rows;
      });

      expect(purged?.oidc_login_states).toBeGreaterThanOrEqual(1);

      const remaining = await sql<{ state_hash: string }>`
        select state_hash from app.oidc_login_states where state_hash = ${expiredHash}
      `.execute(db);
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });
});
