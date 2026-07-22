import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
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

function nowIso(): string {
  return new Date().toISOString();
}

function dedupeKey(
  provider: string,
  channelAccountId: string | null,
  externalEventId: string
): string {
  return `${provider}:${channelAccountId ?? "00000000-0000-0000-0000-000000000000"}:${externalEventId}`;
}

export class InMemoryChannelRepository implements ChannelRepository {
  private readonly accounts = new Map<string, Map<string, ChannelAccountRecord>>();
  private readonly credentials = new Map<string, Map<string, ChannelCredentialRecord>>();
  private readonly oauthStates = new Map<string, OAuthStateRow>();
  private readonly oauthVerifierByState = new Map<string, string>();
  private readonly webhooks = new Map<string, Map<string, WebhookEventRecord>>();
  private readonly webhookDedupe = new Map<string, WebhookEventRecord>();
  private readonly outbound = new Map<string, Map<string, OutboundMessageRecord>>();
  private readonly attempts = new Map<string, OutboundAttemptRecord[]>();
  private readonly idempotentResources = new Map<string, ChannelAccountResource>();
  private readonly idempotentConnectMeta = new Map<
    string,
    { readonly oauth_url: string; readonly state: string }
  >();
  private readonly idempotentJobs = new Map<
    string,
    { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null }
  >();

  private tenantMap<T>(store: Map<string, Map<string, T>>, tenantId: string): Map<string, T> {
    let map = store.get(tenantId);
    if (!map) {
      map = new Map();
      store.set(tenantId, map);
    }
    return map;
  }

  async createAccount(args: {
    readonly tenantId: string;
    readonly accountId: UuidV7;
    readonly provider: string;
    readonly externalAccountId: string;
    readonly displayName: string | null;
    readonly actorId: string;
  }): Promise<ChannelAccountRecord> {
    const createdAt = nowIso();
    const row: ChannelAccountRecord = {
      id: args.accountId,
      tenantId: args.tenantId,
      provider: args.provider,
      externalAccountId: args.externalAccountId,
      displayName: args.displayName,
      status: "connecting",
      health: null,
      grantedScopes: [],
      credentialId: null,
      tokenExpiresAt: null,
      lastSyncAt: null,
      lastError: null,
      version: 1,
      createdAt,
      updatedAt: createdAt
    };
    this.tenantMap(this.accounts, args.tenantId).set(args.accountId, row);
    return row;
  }

  async listAccounts(tenantId: string): Promise<readonly ChannelAccountRecord[]> {
    return [...(this.accounts.get(tenantId)?.values() ?? [])];
  }

  async getAccount(args: {
    readonly tenantId: string;
    readonly accountId: string;
  }): Promise<ChannelAccountRecord | null> {
    return this.accounts.get(args.tenantId)?.get(args.accountId) ?? null;
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
    const current = await this.getAccount(args);
    if (!current) {
      throw new ChannelError("Channel account not found.", "RESOURCE_NOT_FOUND");
    }
    if (args.expectedVersion !== null && current.version !== args.expectedVersion) {
      throw new ChannelError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
    }
    const updated: ChannelAccountRecord = {
      ...current,
      ...args.patch,
      version: current.version + 1,
      updatedAt: nowIso()
    };
    this.tenantMap(this.accounts, args.tenantId).set(args.accountId, updated);
    return updated;
  }

  async saveCredential(args: {
    readonly tenantId: string;
    readonly credentialId: UuidV7;
    readonly channelAccountId: string;
    readonly vaultRef: string;
    readonly expiresAt: string | null;
  }): Promise<ChannelCredentialRecord> {
    const row: ChannelCredentialRecord = {
      id: args.credentialId,
      tenantId: args.tenantId,
      channelAccountId: args.channelAccountId,
      vaultRef: args.vaultRef,
      status: "active",
      expiresAt: args.expiresAt
    };
    this.tenantMap(this.credentials, args.tenantId).set(args.credentialId, row);
    return row;
  }

  async getCredential(args: {
    readonly tenantId: string;
    readonly credentialId: string;
  }): Promise<ChannelCredentialRecord | null> {
    return this.credentials.get(args.tenantId)?.get(args.credentialId) ?? null;
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
    const row: OAuthStateRow = {
      id: args.stateId,
      tenantId: args.tenantId,
      provider: args.provider,
      stateToken: args.stateToken,
      codeVerifierHash: args.codeVerifierHash,
      redirectReturnPath: args.redirectReturnPath,
      channelAccountId: args.channelAccountId,
      expiresAt: args.expiresAt,
      consumedAt: null
    };
    this.oauthStates.set(args.stateToken, row);
    return row;
  }

  /** Test/stub helper — stores PKCE verifier for callback replay. */
  rememberOAuthVerifier(stateToken: string, codeVerifier: string): void {
    this.oauthVerifierByState.set(stateToken, codeVerifier);
  }

  getOAuthVerifier(stateToken: string): string | null {
    return this.oauthVerifierByState.get(stateToken) ?? null;
  }

  async consumeOAuthState(args: {
    readonly stateToken: string;
    readonly codeVerifier: string;
  }): Promise<OAuthStateRow | null> {
    const row = this.oauthStates.get(args.stateToken);
    if (!row || row.consumedAt) return null;
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(args.codeVerifier).digest("hex");
    if (hash !== row.codeVerifierHash) return null;
    const consumed: OAuthStateRow = { ...row, consumedAt: nowIso() };
    this.oauthStates.set(args.stateToken, consumed);
    return consumed;
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
    const existing = this.webhookDedupe.get(key);
    if (existing) {
      return { record: existing, duplicate: true };
    }
    const row: WebhookEventRecord = {
      id: args.eventId,
      tenantId: args.tenantId,
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
      receivedAt: nowIso(),
      processedAt: null
    };
    this.webhookDedupe.set(key, row);
    if (args.tenantId) {
      this.tenantMap(this.webhooks, args.tenantId).set(args.eventId, row);
    }
    return { record: row, duplicate: false };
  }

  async getWebhookEvent(args: {
    readonly tenantId: string;
    readonly eventId: string;
  }): Promise<WebhookEventRecord | null> {
    return this.webhooks.get(args.tenantId)?.get(args.eventId) ?? null;
  }

  async listWebhookEvents(tenantId: string): Promise<readonly WebhookEventRecord[]> {
    return [...(this.webhooks.get(tenantId)?.values() ?? [])];
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
    const current = await this.getWebhookEvent(args);
    if (!current) {
      throw new ChannelError("Webhook event not found.", "RESOURCE_NOT_FOUND");
    }
    const updated: WebhookEventRecord = {
      ...current,
      status: args.status,
      attemptCount: args.attemptCount ?? current.attemptCount,
      nextRetryAt: args.nextRetryAt !== undefined ? args.nextRetryAt : current.nextRetryAt,
      error: args.error !== undefined ? args.error : current.error,
      normalizedEntityId:
        args.normalizedEntityId !== undefined ? args.normalizedEntityId : current.normalizedEntityId,
      processedAt: args.processedAt !== undefined ? args.processedAt : current.processedAt
    };
    this.tenantMap(this.webhooks, args.tenantId).set(args.eventId, updated);
    const key = dedupeKey(updated.provider, updated.channelAccountId, updated.externalEventId);
    this.webhookDedupe.set(key, updated);
    return updated;
  }

  async findWebhookByDedupe(args: {
    readonly provider: string;
    readonly channelAccountId: string | null;
    readonly externalEventId: string;
  }): Promise<WebhookEventRecord | null> {
    return this.webhookDedupe.get(dedupeKey(args.provider, args.channelAccountId, args.externalEventId)) ?? null;
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
    const createdAt = nowIso();
    const row: OutboundMessageRecord = {
      id: args.messageId,
      tenantId: args.tenantId,
      channelAccountId: args.channelAccountId,
      idempotencyKey: args.idempotencyKey,
      status: "queued",
      contentType: args.contentType,
      contentSnapshot: args.contentSnapshot,
      providerMessageId: null,
      blockedReason: null,
      version: 1,
      createdAt,
      updatedAt: createdAt
    };
    this.tenantMap(this.outbound, args.tenantId).set(args.messageId, row);
    return row;
  }

  async getOutboundMessage(args: {
    readonly tenantId: string;
    readonly messageId: string;
  }): Promise<OutboundMessageRecord | null> {
    return this.outbound.get(args.tenantId)?.get(args.messageId) ?? null;
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
    const current = await this.getOutboundMessage(args);
    if (!current) {
      throw new ChannelError("Outbound message not found.", "RESOURCE_NOT_FOUND");
    }
    if (args.expectedVersion !== null && current.version !== args.expectedVersion) {
      throw new ChannelError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
    }
    const updated: OutboundMessageRecord = {
      ...current,
      status: args.status,
      providerMessageId:
        args.providerMessageId !== undefined ? args.providerMessageId : current.providerMessageId,
      blockedReason: args.blockedReason !== undefined ? args.blockedReason : current.blockedReason,
      version: current.version + 1,
      updatedAt: nowIso()
    };
    this.tenantMap(this.outbound, args.tenantId).set(args.messageId, updated);
    return updated;
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
    const row: OutboundAttemptRecord = {
      id: args.attemptId,
      tenantId: args.tenantId,
      outboundMessageId: args.outboundMessageId,
      attemptNumber: args.attemptNumber,
      providerRequestId: args.providerRequestId,
      responseClass: args.responseClass,
      latencyMs: args.latencyMs,
      retryAt: args.retryAt,
      error: args.error,
      createdAt: nowIso()
    };
    const key = `${args.tenantId}:${args.outboundMessageId}`;
    const list = this.attempts.get(key) ?? [];
    list.push(row);
    this.attempts.set(key, list);
    return row;
  }

  async getIdempotentResource(tenantId: string, key: string): Promise<ChannelAccountResource | null> {
    return this.idempotentResources.get(`${tenantId}:${key}`) ?? null;
  }

  async saveIdempotentResource(
    tenantId: string,
    key: string,
    resource: ChannelAccountResource
  ): Promise<void> {
    this.idempotentResources.set(`${tenantId}:${key}`, resource);
  }

  async getIdempotentConnectMeta(
    tenantId: string,
    key: string
  ): Promise<{ readonly oauth_url: string; readonly state: string } | null> {
    return this.idempotentConnectMeta.get(`${tenantId}:${key}`) ?? null;
  }

  async saveIdempotentConnectMeta(
    tenantId: string,
    key: string,
    meta: { readonly oauth_url: string; readonly state: string }
  ): Promise<void> {
    this.idempotentConnectMeta.set(`${tenantId}:${key}`, meta);
  }

  async getIdempotentJobResponse(
    tenantId: string,
    key: string
  ): Promise<{ readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null } | null> {
    return this.idempotentJobs.get(`${tenantId}:${key}`) ?? null;
  }

  async saveIdempotentJobResponse(
    tenantId: string,
    key: string,
    response: { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null }
  ): Promise<void> {
    this.idempotentJobs.set(`${tenantId}:${key}`, response);
  }
}
