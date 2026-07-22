import { createHash } from "node:crypto";
import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import type { UuidV7 } from "@ai-sales/domain-kernel";
import {
  ChannelError,
  type ChannelAccountRecord,
  type ChannelAccountResource,
  type ChannelCredentialRecord,
  type ChannelRepository,
  type JobResponseStatus,
  type OAuthStateRow,
  type OutboundAttemptRecord,
  type OutboundMessageRecord,
  type OutboundStatus,
  type WebhookEventRecord
} from "../../application/channel.js";
import type { AccountHealth, AccountStatus } from "../../domain/health.js";
import { tenantIdFromOAuthStateToken } from "../../domain/oauth.js";

type Trx = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];

type AccountRow = {
  id: string;
  tenant_id: string;
  provider: string;
  external_account_id: string;
  display_name: string | null;
  status: AccountStatus;
  health: AccountHealth;
  granted_scopes: unknown;
  credential_id: string | null;
  token_expires_at: Date | null;
  last_sync_at: Date | null;
  last_error: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type CredentialRow = {
  id: string;
  tenant_id: string;
  channel_account_id: string;
  vault_ref: string;
  status: "active" | "expired" | "revoked";
  expires_at: Date | null;
};

type OAuthRow = {
  id: string;
  tenant_id: string;
  provider: string;
  state_token: string;
  code_verifier_hash: string | null;
  redirect_return_path: string | null;
  channel_account_id: string | null;
  expires_at: Date;
  consumed_at: Date | null;
};

type WebhookRow = {
  id: string;
  tenant_id: string | null;
  channel_account_id: string | null;
  provider: string;
  external_event_id: string;
  event_type: string | null;
  signature_valid: boolean;
  payload_digest: string;
  payload_redacted: unknown;
  status: WebhookEventRecord["status"];
  attempt_count: number;
  next_retry_at: Date | null;
  error: string | null;
  normalized_entity_id: string | null;
  received_at: Date;
  processed_at: Date | null;
};

type OutboundRow = {
  id: string;
  tenant_id: string;
  channel_account_id: string;
  idempotency_key: string | null;
  status: OutboundStatus;
  content_type: string;
  content_snapshot: unknown;
  provider_message_id: string | null;
  blocked_reason: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type AttemptRow = {
  id: string;
  tenant_id: string;
  outbound_message_id: string;
  attempt_number: number;
  provider_request_id: string | null;
  response_class: string | null;
  latency_ms: number | null;
  retry_at: Date | null;
  error: string | null;
  created_at: Date;
};

const ACCOUNT_SELECT = sql`
  id, tenant_id, provider, external_account_id, display_name, status, health,
  granted_scopes, credential_id, token_expires_at, last_sync_at, last_error,
  version, created_at, updated_at
`;

const WEBHOOK_SELECT = sql`
  id, tenant_id, channel_account_id, provider, external_event_id, event_type,
  signature_valid, payload_digest, payload_redacted, status, attempt_count,
  next_retry_at, error, normalized_entity_id, received_at, processed_at
`;

const OUTBOUND_SELECT = sql`
  id, tenant_id, channel_account_id, idempotency_key, status, content_type,
  content_snapshot, provider_message_id, blocked_reason, version, created_at, updated_at
`;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code: unknown }).code) === "23505"
  );
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function dedupeKey(
  provider: string,
  channelAccountId: string | null,
  externalEventId: string
): string {
  return `${provider}:${channelAccountId ?? "00000000-0000-0000-0000-000000000000"}:${externalEventId}`;
}

function toAccount(row: AccountRow): ChannelAccountRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider,
    externalAccountId: row.external_account_id,
    displayName: row.display_name,
    status: row.status,
    health: row.health,
    grantedScopes: parseStringArray(row.granted_scopes),
    credentialId: row.credential_id,
    tokenExpiresAt: toIso(row.token_expires_at),
    lastSyncAt: toIso(row.last_sync_at),
    lastError: row.last_error,
    version: Number(row.version),
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!
  };
}

function toCredential(row: CredentialRow): ChannelCredentialRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    channelAccountId: row.channel_account_id,
    vaultRef: row.vault_ref,
    status: row.status,
    expiresAt: toIso(row.expires_at)
  };
}

function toOAuth(row: OAuthRow): OAuthStateRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider,
    stateToken: row.state_token,
    codeVerifierHash: row.code_verifier_hash ?? "",
    redirectReturnPath: row.redirect_return_path,
    channelAccountId: row.channel_account_id,
    expiresAt: toIso(row.expires_at)!,
    consumedAt: toIso(row.consumed_at)
  };
}

function toWebhook(row: WebhookRow): WebhookEventRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    channelAccountId: row.channel_account_id,
    provider: row.provider,
    externalEventId: row.external_event_id,
    eventType: row.event_type,
    signatureValid: Boolean(row.signature_valid),
    payloadDigest: row.payload_digest,
    payloadRedacted: parseObject(row.payload_redacted),
    status: row.status,
    attemptCount: Number(row.attempt_count),
    nextRetryAt: toIso(row.next_retry_at),
    error: row.error,
    normalizedEntityId: row.normalized_entity_id,
    receivedAt: toIso(row.received_at)!,
    processedAt: toIso(row.processed_at)
  };
}

function toOutbound(row: OutboundRow): OutboundMessageRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    channelAccountId: row.channel_account_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    contentType: row.content_type,
    contentSnapshot: parseObject(row.content_snapshot),
    providerMessageId: row.provider_message_id,
    blockedReason: row.blocked_reason,
    version: Number(row.version),
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!
  };
}

function toAttempt(row: AttemptRow): OutboundAttemptRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    outboundMessageId: row.outbound_message_id,
    attemptNumber: Number(row.attempt_number),
    providerRequestId: row.provider_request_id,
    responseClass: row.response_class,
    latencyMs: row.latency_ms == null ? null : Number(row.latency_ms),
    retryAt: toIso(row.retry_at),
    error: row.error,
    createdAt: toIso(row.created_at)!
  };
}

/** v1 process-local idempotency / oauth-tenant / webhook-dedupe — migrate when wired. */
export class PostgresChannelRepository implements ChannelRepository {
  /** Maps OAuth state_token → tenant_id for consumeOAuthState (no tenant in args). */
  private readonly oauthTenantByStateToken = new Map<string, string>();
  /** Process-local webhook dedupe index (also covers tenantId-null events not stored in DB). */
  private readonly webhookDedupe = new Map<string, WebhookEventRecord>();
  private readonly localWebhooksById = new Map<string, WebhookEventRecord>();
  /** v1 process-local idempotency — migrate to app.idempotency_records when wired. */
  private readonly idempotentResources = new Map<string, ChannelAccountResource>();
  private readonly idempotentConnectMeta = new Map<
    string,
    { readonly oauth_url: string; readonly state: string }
  >();
  private readonly idempotentJobs = new Map<
    string,
    { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null }
  >();

  constructor(private readonly db: AppDatabase) {}

  private idemKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  private indexWebhook(record: WebhookEventRecord): void {
    this.webhookDedupe.set(
      dedupeKey(record.provider, record.channelAccountId, record.externalEventId),
      record
    );
    this.localWebhooksById.set(record.id, record);
  }

  private async loadAccount(
    trx: Trx,
    tenantId: string,
    accountId: string,
    options?: { readonly forUpdate?: boolean }
  ): Promise<ChannelAccountRecord | null> {
    const result = options?.forUpdate
      ? await sql<AccountRow>`
          select ${ACCOUNT_SELECT}
          from app.channel_accounts
          where id = ${accountId}::uuid and tenant_id = ${tenantId}::uuid
          for update
        `.execute(trx)
      : await sql<AccountRow>`
          select ${ACCOUNT_SELECT}
          from app.channel_accounts
          where id = ${accountId}::uuid and tenant_id = ${tenantId}::uuid
        `.execute(trx);
    const row = result.rows[0];
    return row ? toAccount(row) : null;
  }

  private async loadWebhook(
    trx: Trx,
    tenantId: string,
    eventId: string
  ): Promise<WebhookEventRecord | null> {
    const result = await sql<WebhookRow>`
      select ${WEBHOOK_SELECT}
      from app.webhook_events
      where id = ${eventId}::uuid and tenant_id = ${tenantId}::uuid
    `.execute(trx);
    const row = result.rows[0];
    return row ? toWebhook(row) : null;
  }

  private async loadWebhookByDedupe(
    trx: Trx,
    provider: string,
    channelAccountId: string | null,
    externalEventId: string
  ): Promise<WebhookEventRecord | null> {
    const result = await sql<WebhookRow>`
      select ${WEBHOOK_SELECT}
      from app.webhook_events
      where provider = ${provider}
        and coalesce(channel_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(${channelAccountId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        and external_event_id = ${externalEventId}
      limit 1
    `.execute(trx);
    const row = result.rows[0];
    return row ? toWebhook(row) : null;
  }

  private async loadOutbound(
    trx: Trx,
    tenantId: string,
    messageId: string,
    options?: { readonly forUpdate?: boolean }
  ): Promise<OutboundMessageRecord | null> {
    const result = options?.forUpdate
      ? await sql<OutboundRow>`
          select ${OUTBOUND_SELECT}
          from app.outbound_messages
          where id = ${messageId}::uuid and tenant_id = ${tenantId}::uuid
          for update
        `.execute(trx)
      : await sql<OutboundRow>`
          select ${OUTBOUND_SELECT}
          from app.outbound_messages
          where id = ${messageId}::uuid and tenant_id = ${tenantId}::uuid
        `.execute(trx);
    const row = result.rows[0];
    return row ? toOutbound(row) : null;
  }

  private async loadOutboundByIdempotency(
    trx: Trx,
    tenantId: string,
    idempotencyKey: string
  ): Promise<OutboundMessageRecord | null> {
    const result = await sql<OutboundRow>`
      select ${OUTBOUND_SELECT}
      from app.outbound_messages
      where tenant_id = ${tenantId}::uuid and idempotency_key = ${idempotencyKey}
      limit 1
    `.execute(trx);
    const row = result.rows[0];
    return row ? toOutbound(row) : null;
  }

  async createAccount(args: {
    readonly tenantId: string;
    readonly accountId: UuidV7;
    readonly provider: string;
    readonly externalAccountId: string;
    readonly displayName: string | null;
    readonly actorId: string;
  }): Promise<ChannelAccountRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<AccountRow>`
        insert into app.channel_accounts (
          id, tenant_id, provider, external_account_id, display_name,
          status, health, granted_scopes, version, created_by, updated_by
        ) values (
          ${args.accountId}::uuid,
          ${args.tenantId}::uuid,
          ${args.provider},
          ${args.externalAccountId},
          ${args.displayName},
          'connecting',
          null,
          '[]'::jsonb,
          1,
          ${args.actorId}::uuid,
          ${args.actorId}::uuid
        )
        returning ${ACCOUNT_SELECT}
      `.execute(trx);
      return toAccount(result.rows[0]!);
    });
  }

  async listAccounts(tenantId: string): Promise<readonly ChannelAccountRecord[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<AccountRow>`
        select ${ACCOUNT_SELECT}
        from app.channel_accounts
        where tenant_id = ${tenantId}::uuid
        order by created_at asc, id asc
      `.execute(trx);
      return result.rows.map(toAccount);
    });
  }

  async getAccount(args: {
    readonly tenantId: string;
    readonly accountId: string;
  }): Promise<ChannelAccountRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) =>
      this.loadAccount(trx, args.tenantId, args.accountId)
    );
  }

  async updateAccount(args: {
    readonly tenantId: string;
    readonly accountId: string;
    readonly expectedVersion: number | null;
    readonly patch: Partial<
      Pick<
        ChannelAccountRecord,
        | "displayName"
        | "status"
        | "health"
        | "grantedScopes"
        | "credentialId"
        | "tokenExpiresAt"
        | "lastSyncAt"
        | "lastError"
      >
    >;
    readonly actorId: string;
  }): Promise<ChannelAccountRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadAccount(trx, args.tenantId, args.accountId, {
        forUpdate: true
      });
      if (!current) {
        throw new ChannelError("Channel account not found.", "RESOURCE_NOT_FOUND");
      }
      if (args.expectedVersion !== null && current.version !== args.expectedVersion) {
        throw new ChannelError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }

      const displayName =
        args.patch.displayName !== undefined ? args.patch.displayName : current.displayName;
      const status = args.patch.status !== undefined ? args.patch.status : current.status;
      const health = args.patch.health !== undefined ? args.patch.health : current.health;
      const grantedScopes =
        args.patch.grantedScopes !== undefined ? args.patch.grantedScopes : current.grantedScopes;
      const credentialId =
        args.patch.credentialId !== undefined ? args.patch.credentialId : current.credentialId;
      const tokenExpiresAt =
        args.patch.tokenExpiresAt !== undefined ? args.patch.tokenExpiresAt : current.tokenExpiresAt;
      const lastSyncAt =
        args.patch.lastSyncAt !== undefined ? args.patch.lastSyncAt : current.lastSyncAt;
      const lastError =
        args.patch.lastError !== undefined ? args.patch.lastError : current.lastError;

      const versionClause =
        args.expectedVersion !== null
          ? sql`and version = ${args.expectedVersion}`
          : sql``;

      const updated = await sql<AccountRow>`
        update app.channel_accounts
        set display_name = ${displayName},
            status = ${status},
            health = ${health},
            granted_scopes = ${JSON.stringify([...grantedScopes])}::jsonb,
            credential_id = ${credentialId}::uuid,
            token_expires_at = ${tokenExpiresAt}::timestamptz,
            last_sync_at = ${lastSyncAt}::timestamptz,
            last_error = ${lastError},
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.accountId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          ${versionClause}
        returning ${ACCOUNT_SELECT}
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new ChannelError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      return toAccount(updated.rows[0]);
    });
  }

  async saveCredential(args: {
    readonly tenantId: string;
    readonly credentialId: UuidV7;
    readonly channelAccountId: string;
    readonly vaultRef: string;
    readonly expiresAt: string | null;
  }): Promise<ChannelCredentialRecord> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<CredentialRow>`
        insert into app.channel_credentials (
          id, tenant_id, channel_account_id, vault_ref, status, expires_at
        ) values (
          ${args.credentialId}::uuid,
          ${args.tenantId}::uuid,
          ${args.channelAccountId}::uuid,
          ${args.vaultRef},
          'active',
          ${args.expiresAt}::timestamptz
        )
        returning id, tenant_id, channel_account_id, vault_ref, status, expires_at
      `.execute(trx);
      return toCredential(result.rows[0]!);
    });
  }

  async getCredential(args: {
    readonly tenantId: string;
    readonly credentialId: string;
  }): Promise<ChannelCredentialRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<CredentialRow>`
        select id, tenant_id, channel_account_id, vault_ref, status, expires_at
        from app.channel_credentials
        where id = ${args.credentialId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      const row = result.rows[0];
      return row ? toCredential(row) : null;
    });
  }

  async saveOAuthState(args: {
    readonly tenantId: string;
    readonly stateId: UuidV7;
    readonly provider: string;
    readonly stateToken: string;
    readonly codeVerifierHash: string;
    readonly redirectReturnPath: string | null;
    readonly channelAccountId: string | null;
    readonly expiresAt: string;
  }): Promise<OAuthStateRow> {
    const ctx = adapterSecurityContext(args.tenantId);
    const row = await withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<OAuthRow>`
        insert into app.channel_oauth_states (
          id, tenant_id, provider, state_token, code_verifier_hash,
          redirect_return_path, channel_account_id, expires_at
        ) values (
          ${args.stateId}::uuid,
          ${args.tenantId}::uuid,
          ${args.provider},
          ${args.stateToken},
          ${args.codeVerifierHash},
          ${args.redirectReturnPath},
          ${args.channelAccountId}::uuid,
          ${args.expiresAt}::timestamptz
        )
        returning id, tenant_id, provider, state_token, code_verifier_hash,
                  redirect_return_path, channel_account_id, expires_at, consumed_at
      `.execute(trx);
      return toOAuth(result.rows[0]!);
    });
    this.oauthTenantByStateToken.set(args.stateToken, args.tenantId);
    return row;
  }

  async consumeOAuthState(args: {
    readonly stateToken: string;
    readonly codeVerifier: string;
  }): Promise<OAuthStateRow | null> {
    const tenantId =
      this.oauthTenantByStateToken.get(args.stateToken) ??
      tenantIdFromOAuthStateToken(args.stateToken);
    if (!tenantId) return null;
    const hash = createHash("sha256").update(args.codeVerifier).digest("hex");
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const existing = await sql<OAuthRow>`
        select id, tenant_id, provider, state_token, code_verifier_hash,
               redirect_return_path, channel_account_id, expires_at, consumed_at
        from app.channel_oauth_states
        where state_token = ${args.stateToken}
          and tenant_id = ${tenantId}::uuid
        for update
      `.execute(trx);
      const row = existing.rows[0];
      if (!row || row.consumed_at) return null;
      if (row.expires_at.getTime() <= Date.now()) return null;
      if (row.code_verifier_hash !== hash) return null;

      const updated = await sql<OAuthRow>`
        update app.channel_oauth_states
        set consumed_at = now()
        where id = ${row.id}::uuid
          and tenant_id = ${tenantId}::uuid
          and consumed_at is null
        returning id, tenant_id, provider, state_token, code_verifier_hash,
                  redirect_return_path, channel_account_id, expires_at, consumed_at
      `.execute(trx);
      const consumed = updated.rows[0];
      return consumed ? toOAuth(consumed) : null;
    });
  }

  async insertWebhookEvent(args: {
    readonly eventId: UuidV7;
    readonly tenantId: string | null;
    readonly channelAccountId: string | null;
    readonly provider: string;
    readonly externalEventId: string;
    readonly eventType: string | null;
    readonly signatureValid: boolean;
    readonly payloadDigest: string;
    readonly payloadRedacted: Record<string, unknown>;
  }): Promise<{ readonly record: WebhookEventRecord; readonly duplicate: boolean }> {
    const key = dedupeKey(args.provider, args.channelAccountId, args.externalEventId);
    const cached = this.webhookDedupe.get(key);
    if (cached) {
      return { record: cached, duplicate: true };
    }

    // RLS WITH CHECK needs tenant_id = app.tenant_id; null-tenant events stay process-local.
    if (!args.tenantId) {
      const record: WebhookEventRecord = {
        id: args.eventId,
        tenantId: null,
        channelAccountId: args.channelAccountId,
        provider: args.provider,
        externalEventId: args.externalEventId,
        eventType: args.eventType,
        signatureValid: args.signatureValid,
        payloadDigest: args.payloadDigest,
        payloadRedacted: args.payloadRedacted,
        status: "received",
        attemptCount: 0,
        nextRetryAt: null,
        error: null,
        normalizedEntityId: null,
        receivedAt: new Date().toISOString(),
        processedAt: null
      };
      this.indexWebhook(record);
      return { record, duplicate: false };
    }

    const ctx = adapterSecurityContext(args.tenantId);
    try {
      const record = await withTenantTransaction(this.db, ctx, async (trx) => {
        const result = await sql<WebhookRow>`
          insert into app.webhook_events (
            id, tenant_id, channel_account_id, provider, external_event_id, event_type,
            signature_valid, payload_digest, payload_redacted, status, attempt_count
          ) values (
            ${args.eventId}::uuid,
            ${args.tenantId}::uuid,
            ${args.channelAccountId}::uuid,
            ${args.provider},
            ${args.externalEventId},
            ${args.eventType},
            ${args.signatureValid},
            ${args.payloadDigest},
            ${JSON.stringify(args.payloadRedacted)}::jsonb,
            'received',
            0
          )
          returning ${WEBHOOK_SELECT}
        `.execute(trx);
        return toWebhook(result.rows[0]!);
      });
      this.indexWebhook(record);
      return { record, duplicate: false };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await withTenantTransaction(this.db, ctx, async (trx) =>
        this.loadWebhookByDedupe(trx, args.provider, args.channelAccountId, args.externalEventId)
      );
      if (existing) {
        this.indexWebhook(existing);
        return { record: existing, duplicate: true };
      }
      // Cross-tenant / RLS-invisible conflict: ack as duplicate without leaking rows.
      const cached = this.webhookDedupe.get(key);
      if (cached) return { record: cached, duplicate: true };
      throw new ChannelError("Webhook duplicate.", "WEBHOOK_DUPLICATE");
    }
  }

  async getWebhookEvent(args: {
    readonly tenantId: string;
    readonly eventId: string;
  }): Promise<WebhookEventRecord | null> {
    const local = this.localWebhooksById.get(args.eventId);
    if (local && local.tenantId === args.tenantId) return local;
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const row = await this.loadWebhook(trx, args.tenantId, args.eventId);
      if (row) this.indexWebhook(row);
      return row;
    });
  }

  async listWebhookEvents(tenantId: string): Promise<readonly WebhookEventRecord[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<WebhookRow>`
        select ${WEBHOOK_SELECT}
        from app.webhook_events
        where tenant_id = ${tenantId}::uuid
        order by received_at desc, id desc
      `.execute(trx);
      const rows = result.rows.map(toWebhook);
      for (const row of rows) this.indexWebhook(row);
      return rows;
    });
  }

  async updateWebhookEvent(args: {
    readonly tenantId: string;
    readonly eventId: string;
    readonly status: WebhookEventRecord["status"];
    readonly attemptCount?: number;
    readonly nextRetryAt?: string | null;
    readonly error?: string | null;
    readonly normalizedEntityId?: string | null;
    readonly processedAt?: string | null;
  }): Promise<WebhookEventRecord> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadWebhook(trx, args.tenantId, args.eventId);
      if (!current) {
        throw new ChannelError("Webhook event not found.", "RESOURCE_NOT_FOUND");
      }
      const attemptCount =
        args.attemptCount !== undefined ? args.attemptCount : current.attemptCount;
      const nextRetryAt =
        args.nextRetryAt !== undefined ? args.nextRetryAt : current.nextRetryAt;
      const error = args.error !== undefined ? args.error : current.error;
      const normalizedEntityId =
        args.normalizedEntityId !== undefined
          ? args.normalizedEntityId
          : current.normalizedEntityId;
      const processedAt =
        args.processedAt !== undefined ? args.processedAt : current.processedAt;

      const updated = await sql<WebhookRow>`
        update app.webhook_events
        set status = ${args.status},
            attempt_count = ${attemptCount},
            next_retry_at = ${nextRetryAt}::timestamptz,
            error = ${error},
            normalized_entity_id = ${normalizedEntityId}::uuid,
            processed_at = ${processedAt}::timestamptz
        where id = ${args.eventId}::uuid and tenant_id = ${args.tenantId}::uuid
        returning ${WEBHOOK_SELECT}
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new ChannelError("Webhook event not found.", "RESOURCE_NOT_FOUND");
      }
      const record = toWebhook(updated.rows[0]);
      this.indexWebhook(record);
      return record;
    });
  }

  async findWebhookByDedupe(args: {
    readonly provider: string;
    readonly channelAccountId: string | null;
    readonly externalEventId: string;
  }): Promise<WebhookEventRecord | null> {
    return (
      this.webhookDedupe.get(
        dedupeKey(args.provider, args.channelAccountId, args.externalEventId)
      ) ?? null
    );
  }

  async createOutboundMessage(args: {
    readonly tenantId: string;
    readonly messageId: UuidV7;
    readonly channelAccountId: string;
    readonly idempotencyKey: string | null;
    readonly contentType: string;
    readonly contentSnapshot: Record<string, unknown>;
    readonly actorId: string;
  }): Promise<OutboundMessageRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    try {
      return await withTenantTransaction(this.db, ctx, async (trx) => {
        const result = await sql<OutboundRow>`
          insert into app.outbound_messages (
            id, tenant_id, channel_account_id, idempotency_key, status,
            content_type, content_snapshot, version, created_by, updated_by
          ) values (
            ${args.messageId}::uuid,
            ${args.tenantId}::uuid,
            ${args.channelAccountId}::uuid,
            ${args.idempotencyKey},
            'queued',
            ${args.contentType},
            ${JSON.stringify(args.contentSnapshot)}::jsonb,
            1,
            ${args.actorId}::uuid,
            ${args.actorId}::uuid
          )
          returning ${OUTBOUND_SELECT}
        `.execute(trx);
        return toOutbound(result.rows[0]!);
      });
    } catch (error) {
      if (!isUniqueViolation(error) || !args.idempotencyKey) throw error;
      const existing = await withTenantTransaction(this.db, ctx, async (trx) =>
        this.loadOutboundByIdempotency(trx, args.tenantId, args.idempotencyKey!)
      );
      if (!existing) throw error;
      return existing;
    }
  }

  async getOutboundMessage(args: {
    readonly tenantId: string;
    readonly messageId: string;
  }): Promise<OutboundMessageRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) =>
      this.loadOutbound(trx, args.tenantId, args.messageId)
    );
  }

  async updateOutboundMessage(args: {
    readonly tenantId: string;
    readonly messageId: string;
    readonly expectedVersion: number | null;
    readonly status: OutboundStatus;
    readonly providerMessageId?: string | null;
    readonly blockedReason?: string | null;
    readonly actorId: string;
  }): Promise<OutboundMessageRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadOutbound(trx, args.tenantId, args.messageId, {
        forUpdate: true
      });
      if (!current) {
        throw new ChannelError("Outbound message not found.", "RESOURCE_NOT_FOUND");
      }
      if (args.expectedVersion !== null && current.version !== args.expectedVersion) {
        throw new ChannelError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const providerMessageId =
        args.providerMessageId !== undefined
          ? args.providerMessageId
          : current.providerMessageId;
      const blockedReason =
        args.blockedReason !== undefined ? args.blockedReason : current.blockedReason;
      const versionClause =
        args.expectedVersion !== null
          ? sql`and version = ${args.expectedVersion}`
          : sql``;

      const updated = await sql<OutboundRow>`
        update app.outbound_messages
        set status = ${args.status},
            provider_message_id = ${providerMessageId},
            blocked_reason = ${blockedReason},
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.messageId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          ${versionClause}
        returning ${OUTBOUND_SELECT}
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new ChannelError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      return toOutbound(updated.rows[0]);
    });
  }

  async addOutboundAttempt(args: {
    readonly tenantId: string;
    readonly attemptId: UuidV7;
    readonly outboundMessageId: string;
    readonly attemptNumber: number;
    readonly providerRequestId: string | null;
    readonly responseClass: string | null;
    readonly latencyMs: number | null;
    readonly retryAt: string | null;
    readonly error: string | null;
  }): Promise<OutboundAttemptRecord> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<AttemptRow>`
        insert into app.outbound_delivery_attempts (
          id, tenant_id, outbound_message_id, attempt_number, provider_request_id,
          response_class, latency_ms, retry_at, error
        ) values (
          ${args.attemptId}::uuid,
          ${args.tenantId}::uuid,
          ${args.outboundMessageId}::uuid,
          ${args.attemptNumber},
          ${args.providerRequestId},
          ${args.responseClass},
          ${args.latencyMs},
          ${args.retryAt}::timestamptz,
          ${args.error}
        )
        returning id, tenant_id, outbound_message_id, attempt_number, provider_request_id,
                  response_class, latency_ms, retry_at, error, created_at
      `.execute(trx);
      return toAttempt(result.rows[0]!);
    });
  }

  async getIdempotentResource(
    tenantId: string,
    key: string
  ): Promise<ChannelAccountResource | null> {
    return this.idempotentResources.get(this.idemKey(tenantId, key)) ?? null;
  }

  async saveIdempotentResource(
    tenantId: string,
    key: string,
    resource: ChannelAccountResource
  ): Promise<void> {
    this.idempotentResources.set(this.idemKey(tenantId, key), resource);
  }

  async getIdempotentConnectMeta(
    tenantId: string,
    key: string
  ): Promise<{ readonly oauth_url: string; readonly state: string } | null> {
    return this.idempotentConnectMeta.get(this.idemKey(tenantId, key)) ?? null;
  }

  async saveIdempotentConnectMeta(
    tenantId: string,
    key: string,
    meta: { readonly oauth_url: string; readonly state: string }
  ): Promise<void> {
    this.idempotentConnectMeta.set(this.idemKey(tenantId, key), meta);
  }

  async getIdempotentJobResponse(
    tenantId: string,
    key: string
  ): Promise<{
    readonly job_id: string;
    readonly status: JobResponseStatus;
    readonly status_url: string | null;
  } | null> {
    return this.idempotentJobs.get(this.idemKey(tenantId, key)) ?? null;
  }

  async saveIdempotentJobResponse(
    tenantId: string,
    key: string,
    response: {
      readonly job_id: string;
      readonly status: JobResponseStatus;
      readonly status_url: string | null;
    }
  ): Promise<void> {
    this.idempotentJobs.set(this.idemKey(tenantId, key), response);
  }
}
