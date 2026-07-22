#!/usr/bin/env node
/**
 * Staging smoke: migrate (optional) + invite member + accept invitation.
 *
 * Usage:
 *   DATABASE_URL=... node tools/smoke-invite-accept.mjs
 *   DATABASE_URL=... SMOKE_MIGRATE=1 node tools/smoke-invite-accept.mjs
 *   API_BASE=http://localhost:3000 DATABASE_URL=... node tools/smoke-invite-accept.mjs
 *
 * Requires an already-provisioned tenant + actor with member.invite, or set:
 *   SMOKE_TENANT_ID / SMOKE_ACTOR_ID / SMOKE_OWNER_ROLE_ID
 */
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function requireEnv(name) {
  const value = process.env[name];
  if (!value?.trim()) {
    console.error(`${name} is required`);
    process.exit(1);
  }
  return value.trim();
}

function uuidV7Like() {
  // Not a strict UUIDv7 — staging helper only. Prefer real generator in app.
  const buf = randomBytes(16);
  buf[6] = (buf[6] & 0x0f) | 0x70;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const hex = buf.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const apiBase = (process.env.API_BASE ?? "").replace(/\/$/, "");

  if (process.env.SMOKE_MIGRATE === "1") {
    console.log("Applying pending migrations...");
    const migrate = spawnSync(process.execPath, [path.join(ROOT, "tools", "migrate.mjs")], {
      env: process.env,
      stdio: "inherit"
    });
    if (migrate.status !== 0) process.exit(migrate.status ?? 1);
  }

  if (!apiBase) {
    // DB-level smoke via DEFINER helpers (no HTTP).
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const tenantId = process.env.SMOKE_TENANT_ID;
      const actorId = process.env.SMOKE_ACTOR_ID;
      const roleId = process.env.SMOKE_OWNER_ROLE_ID;
      if (!tenantId || !actorId || !roleId) {
        console.log(
          "No API_BASE — set SMOKE_TENANT_ID, SMOKE_ACTOR_ID, SMOKE_OWNER_ROLE_ID for DB invite/accept smoke."
        );
        console.log("Checking ops helpers exist...");
        const helpers = await client.query(`
          select proname from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'app'
            and proname in ('invite_member', 'accept_invitation', 'ops_list_tenants', 'ops_ai_health_snapshot')
          order by proname
        `);
        console.log(
          "helpers:",
          helpers.rows.map((r) => r.proname).join(", ") || "(none — run migrate through 000027)"
        );
        const pendingHint = await client.query(`
          select version from app.schema_migrations
          where version like '00002%'
          order by version
        `).catch(() => ({ rows: [] }));
        console.log(
          "applied 00002x:",
          pendingHint.rows.map((r) => r.version).join(", ") || "(schema_migrations missing)"
        );
        return;
      }

      const invitationId = uuidV7Like();
      const membershipId = uuidV7Like();
      const userId = uuidV7Like();
      const email = `smoke+${Date.now()}@example.com`;
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 864e5).toISOString();

      const invited = await client.query(
        `select * from app.invite_member($1::uuid,$2::uuid,$3,$4,$5::uuid[],$6::uuid,$7::uuid,$8::uuid,$9,$10::timestamptz)`,
        [
          tenantId,
          actorId,
          email,
          "Smoke Invitee",
          [roleId],
          invitationId,
          membershipId,
          userId,
          tokenHash,
          expiresAt
        ]
      );
      const invRow = invited.rows[0];
      if (invRow?.error_code) {
        console.error("invite_member error:", invRow.error_code);
        process.exit(1);
      }
      console.log("invite ok:", invRow.out_membership_id, invRow.out_status);

      const accepted = await client.query(
        `select * from app.accept_invitation($1, $2, now())`,
        [tokenHash, null]
      );
      const acc = accepted.rows[0];
      if (acc?.outcome !== "ok") {
        console.error("accept_invitation outcome:", acc?.outcome);
        process.exit(1);
      }
      console.log("accept ok:", acc.membership_id, acc.email, "perms=", acc.permissions?.length ?? 0);
    } finally {
      await client.end();
    }
    return;
  }

  // HTTP path: invite token is NOT returned publicly (email/outbox later).
  // Prefer DB DEFINER smoke above for invite→accept; HTTP only checks invite endpoint.
  const actorId = requireEnv("SMOKE_ACTOR_ID");
  const roleId = requireEnv("SMOKE_OWNER_ROLE_ID");
  const email = `smoke+${Date.now()}@example.com`;
  const headers = {
    "content-type": "application/json",
    "x-actor-id": actorId,
    "x-permissions": "member.invite,member.read,role.read",
    "idempotency-key": `smoke-invite-${Date.now()}`
  };

  const inviteRes = await fetch(`${apiBase}/api/v1/members/invitations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      display_name: "Smoke Invitee",
      role_ids: [roleId]
    })
  });
  const inviteBody = await inviteRes.json().catch(() => ({}));
  if (!inviteRes.ok) {
    console.error("invite HTTP", inviteRes.status, inviteBody);
    process.exit(1);
  }
  console.log("invite HTTP ok:", inviteBody?.data?.id, inviteBody?.data?.status);

  const token = process.env.SMOKE_INVITE_TOKEN;
  if (!token) {
    console.log(
      "Token not in HTTP response (by design). For accept smoke use DB mode (no API_BASE) or set SMOKE_INVITE_TOKEN."
    );
    return;
  }

  const acceptRes = await fetch(`${apiBase}/api/v1/invitations/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password: "SmokePassw0rd!" })
  });
  const acceptBody = await acceptRes.json().catch(() => ({}));
  if (!acceptRes.ok) {
    console.error("accept HTTP", acceptRes.status, acceptBody);
    process.exit(1);
  }
  console.log("accept HTTP ok:", acceptBody);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
