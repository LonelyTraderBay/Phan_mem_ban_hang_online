import { sql } from "kysely";
import type { AppDatabase } from "./index.js";

export type EphemeralPurgeCounts = {
  oidc_login_states: number;
  media_upload_intents: number;
  password_reset_tokens: number;
  mfa_challenges: number;
  idempotency_records: number;
};

export async function purgeEphemeralRows(db: AppDatabase): Promise<EphemeralPurgeCounts> {
  const result = await sql<{ purge_ephemeral_rows: EphemeralPurgeCounts }>`
    select app.purge_ephemeral_rows() as purge_ephemeral_rows
  `.execute(db);
  const row = result.rows[0];
  if (!row) {
    throw new Error("purge_ephemeral_rows returned no row");
  }
  return row.purge_ephemeral_rows;
}
