import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import {
  adapterSecurityContext,
  createDatabase,
  withTenantTransaction
} from "@ai-sales/database";
import { generateUuidV7 } from "@ai-sales/domain-kernel";
import { hashCodeVerifier } from "../../domain/oauth.js";
import { PostgresChannelRepository } from "./postgres-channel.js";

const MIGRATION_030 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../infra/migrations/000030_channel_oauth_webhook_durable.sql"
);

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("P4 channel OAuth/webhook durable migration artefact", () => {
  it("defines SECURITY DEFINER helpers and grants", () => {
    const sqlText = readFileSync(MIGRATION_030, "utf8");
    expect(sqlText).toContain("CREATE OR REPLACE FUNCTION app.channel_resolve_oauth_tenant");
    expect(sqlText).toContain("CREATE OR REPLACE FUNCTION app.channel_consume_oauth_state");
    expect(sqlText).toContain("CREATE OR REPLACE FUNCTION app.channel_insert_webhook_event");
    expect(sqlText).toContain("CREATE OR REPLACE FUNCTION app.channel_find_webhook_by_dedupe");
    expect(sqlText).toContain("uq_webhook_events_dedupe");
    expect(sqlText).toMatch(/SECURITY DEFINER/);
    expect(sqlText).toContain(
      "GRANT EXECUTE ON FUNCTION app.channel_consume_oauth_state(TEXT, TEXT)"
    );
    expect(sqlText).toContain(
      "GRANT EXECUTE ON FUNCTION app.channel_insert_webhook_event("
    );
  });

  it("PostgresChannelRepository has no process-local OAuth/webhook Maps", () => {
    const source = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "postgres-channel.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/oauthTenantByStateToken/);
    expect(source).not.toMatch(/webhookDedupe/);
    expect(source).not.toMatch(/localWebhooksById/);
    expect(source).toContain("channel_consume_oauth_state");
    expect(source).toContain("channel_insert_webhook_event");
    expect(source).toContain("channel_find_webhook_by_dedupe");
  });
});

describe("PostgresChannelRepository", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresChannelRepository(db)).not.toThrow();
  });
});

describeDb("PostgresChannelRepository integration (P4 durable)", () => {
  it("listAccounts returns array for tenant context", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresChannelRepository(db);
    const tenantId = "018f0000-0000-7000-8000-000000000099";
    const rows = await repo.listAccounts(tenantId);
    expect(Array.isArray(rows)).toBe(true);
    await db.destroy();
  });

  it("persists OAuth state and consumes without process-local Map", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresChannelRepository(db);
    const tenantId = "018f0000-0000-7000-8000-0000000000a1";
    const actorId = "018f0000-0000-7000-8000-0000000000a2";
    const ctx = adapterSecurityContext(tenantId, actorId);
    await withTenantTransaction(db, ctx, async (trx) => {
      await sql`
        insert into app.tenants (id, code, name, status)
        values (
          ${tenantId}::uuid,
          ${"chn-p4-" + tenantId.slice(0, 8)},
          'P4 Channel Tenant',
          'active'
        )
        on conflict (id) do nothing
      `.execute(trx);
    });

    const account = await repo.createAccount({
      tenantId,
      accountId: generateUuidV7(),
      provider: "facebook",
      externalAccountId: `ext-${generateUuidV7()}`,
      displayName: "P4 OAuth page",
      actorId
    });
    const verifier = "pkce-verifier-durable-oauth-test-123456";
    const stateToken = `${tenantId}.${generateUuidV7()}`;
    await repo.saveOAuthState({
      tenantId,
      stateId: generateUuidV7(),
      provider: "facebook",
      stateToken,
      codeVerifierHash: hashCodeVerifier(verifier),
      redirectReturnPath: "/settings/channels",
      channelAccountId: account.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    // Fresh repository instance simulates another API process (no Maps).
    const repo2 = new PostgresChannelRepository(db);
    const consumed = await repo2.consumeOAuthState({
      stateToken,
      codeVerifier: verifier
    });
    expect(consumed).not.toBeNull();
    expect(consumed!.tenantId).toBe(tenantId);
    expect(consumed!.channelAccountId).toBe(account.id);
    expect(consumed!.consumedAt).not.toBeNull();

    const replay = await repo2.consumeOAuthState({
      stateToken,
      codeVerifier: verifier
    });
    expect(replay).toBeNull();

    await db.destroy();
  });

  it("dedupes null-tenant webhook events via DB unique index", async () => {
    const db = createDatabase(databaseUrl!);
    const repo = new PostgresChannelRepository(db);
    const externalEventId = `evt-null-${generateUuidV7()}`;
    const first = await repo.insertWebhookEvent({
      eventId: generateUuidV7(),
      tenantId: null,
      channelAccountId: null,
      provider: "facebook",
      externalEventId,
      eventType: "page",
      signatureValid: true,
      payloadDigest: createHash("sha256").update(externalEventId).digest("hex"),
      payloadRedacted: { object: "page" }
    });
    expect(first.duplicate).toBe(false);
    expect(first.record.tenantId).toBeNull();

    const repo2 = new PostgresChannelRepository(db);
    const found = await repo2.findWebhookByDedupe({
      provider: "facebook",
      channelAccountId: null,
      externalEventId
    });
    expect(found?.id).toBe(first.record.id);

    const second = await repo2.insertWebhookEvent({
      eventId: generateUuidV7(),
      tenantId: null,
      channelAccountId: null,
      provider: "facebook",
      externalEventId,
      eventType: "page",
      signatureValid: true,
      payloadDigest: createHash("sha256").update(externalEventId).digest("hex"),
      payloadRedacted: { object: "page" }
    });
    expect(second.duplicate).toBe(true);
    expect(second.record.id).toBe(first.record.id);

    await db.destroy();
  });
});
