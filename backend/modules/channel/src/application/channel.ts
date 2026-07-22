import { createHash } from "node:crypto";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import type { ChannelProviderAdapter, NormalizedChannelEvent } from "../domain/adapter.js";
import {
  computeAccountHealth,
  deriveAccountStatus,
  missingScopes,
  type AccountHealth,
  type AccountStatus
} from "../domain/health.js";
import {
  buildOAuthAuthorizeUrlStub,
  generateOAuthStateToken,
  generatePkcePair,
  hashCodeVerifier,
  isOAuthStateExpired
} from "../domain/oauth.js";
export type { OutboundStatus } from "../domain/outbound.js";
import {
  assertOutboundTransition,
  canRetryOutbound,
  mapProviderResponseToStatus
} from "../domain/outbound.js";
import type { OutboundStatus } from "../domain/outbound.js";
import { classifyQueueError, scheduleRetryAt, shouldMoveToDlq } from "../domain/queue.js";
import {
  circuitAllowsRequest,
  consumeRateLimitToken,
  recordCircuitFailure,
  type CircuitBreakerState,
  type RateLimitBucket
} from "../domain/rate-limit.js";
import { digestRawBody, redactWebhookPayload, verifyWebhookSignatureStub } from "../domain/webhook.js";

/**
 * BE-CHN-001…011 — Channel application layer (accounts, OAuth, webhooks, outbound).
 * In-memory until Postgres adapter. Mirrors knowledge/inventory style.
 */

export type ChannelPermission =
  | "channel.read"
  | "channel.connect"
  | "channel.manage"
  | "channel.send"
  | "ops.reprocess";

export type ChannelErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_VERSION_MISMATCH"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "CHANNEL_NOT_CONNECTED"
  | "CHANNEL_TOKEN_EXPIRED"
  | "CHANNEL_PERMISSION_MISSING"
  | "WEBHOOK_SIGNATURE_INVALID"
  | "WEBHOOK_DUPLICATE"
  | "MESSAGE_SEND_BLOCKED";

export class ChannelError extends Error {
  constructor(
    message: string,
    readonly code: ChannelErrorCode
  ) {
    super(message);
    this.name = "ChannelError";
  }
}

/** Frozen OpenAPI ChannelAccountResource. */
export interface ChannelAccountResource {
  readonly id: string;
  readonly tenant_id: string;
  readonly provider: string;
  readonly display_name: string | null;
  readonly status: AccountStatus;
  readonly health: AccountHealth;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Frozen OpenAPI WebhookEventResource. */
export interface WebhookEventResource {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly provider: string;
  readonly event_type: string | null;
  readonly status: "received" | "normalized" | "failed" | "reprocessed" | "dead_letter";
  readonly received_at: string;
}

export type JobResponseStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ChannelAccountRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly provider: string;
  readonly externalAccountId: string;
  readonly displayName: string | null;
  readonly status: AccountStatus;
  readonly health: AccountHealth;
  readonly grantedScopes: readonly string[];
  readonly credentialId: string | null;
  readonly tokenExpiresAt: string | null;
  readonly lastSyncAt: string | null;
  readonly lastError: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ChannelCredentialRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly channelAccountId: string;
  readonly vaultRef: string;
  readonly status: "active" | "expired" | "revoked";
  readonly expiresAt: string | null;
}

export interface OAuthStateRow {
  readonly id: string;
  readonly tenantId: string;
  readonly provider: string;
  readonly stateToken: string;
  readonly codeVerifierHash: string;
  readonly redirectReturnPath: string | null;
  readonly channelAccountId: string | null;
  readonly expiresAt: string;
  readonly consumedAt: string | null;
}

export interface WebhookEventRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly channelAccountId: string | null;
  readonly provider: string;
  readonly externalEventId: string;
  readonly eventType: string | null;
  readonly signatureValid: boolean;
  readonly payloadDigest: string;
  readonly payloadRedacted: Record<string, unknown>;
  readonly status: WebhookEventResource["status"];
  readonly attemptCount: number;
  readonly nextRetryAt: string | null;
  readonly error: string | null;
  readonly normalizedEntityId: string | null;
  readonly receivedAt: string;
  readonly processedAt: string | null;
}

export interface OutboundMessageRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly channelAccountId: string;
  readonly idempotencyKey: string | null;
  readonly status: OutboundStatus;
  readonly contentType: string;
  readonly contentSnapshot: Record<string, unknown>;
  readonly providerMessageId: string | null;
  readonly blockedReason: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OutboundAttemptRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly outboundMessageId: string;
  readonly attemptNumber: number;
  readonly providerRequestId: string | null;
  readonly responseClass: string | null;
  readonly latencyMs: number | null;
  readonly retryAt: string | null;
  readonly error: string | null;
  readonly createdAt: string;
}

export interface ChannelRepository {
  createAccount(args: {
    readonly tenantId: string;
    readonly accountId: UuidV7;
    readonly provider: string;
    readonly externalAccountId: string;
    readonly displayName: string | null;
    readonly actorId: string;
  }): Promise<ChannelAccountRecord>;
  listAccounts(tenantId: string): Promise<readonly ChannelAccountRecord[]>;
  getAccount(args: { readonly tenantId: string; readonly accountId: string }): Promise<ChannelAccountRecord | null>;
  updateAccount(args: {
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
  }): Promise<ChannelAccountRecord>;

  saveCredential(args: {
    readonly tenantId: string;
    readonly credentialId: UuidV7;
    readonly channelAccountId: string;
    readonly vaultRef: string;
    readonly expiresAt: string | null;
  }): Promise<ChannelCredentialRecord>;
  getCredential(args: {
    readonly tenantId: string;
    readonly credentialId: string;
  }): Promise<ChannelCredentialRecord | null>;

  saveOAuthState(args: {
    readonly tenantId: string;
    readonly stateId: UuidV7;
    readonly provider: string;
    readonly stateToken: string;
    readonly codeVerifierHash: string;
    readonly redirectReturnPath: string | null;
    readonly channelAccountId: string | null;
    readonly expiresAt: string;
  }): Promise<OAuthStateRow>;
  consumeOAuthState(args: {
    readonly stateToken: string;
    readonly codeVerifier: string;
  }): Promise<OAuthStateRow | null>;

  insertWebhookEvent(args: {
    readonly eventId: UuidV7;
    readonly tenantId: string | null;
    readonly channelAccountId: string | null;
    readonly provider: string;
    readonly externalEventId: string;
    readonly eventType: string | null;
    readonly signatureValid: boolean;
    readonly payloadDigest: string;
    readonly payloadRedacted: Record<string, unknown>;
  }): Promise<{ readonly record: WebhookEventRecord; readonly duplicate: boolean }>;
  getWebhookEvent(args: {
    readonly tenantId: string;
    readonly eventId: string;
  }): Promise<WebhookEventRecord | null>;
  listWebhookEvents(tenantId: string): Promise<readonly WebhookEventRecord[]>;
  updateWebhookEvent(args: {
    readonly tenantId: string;
    readonly eventId: string;
    readonly status: WebhookEventRecord["status"];
    readonly attemptCount?: number;
    readonly nextRetryAt?: string | null;
    readonly error?: string | null;
    readonly normalizedEntityId?: string | null;
    readonly processedAt?: string | null;
  }): Promise<WebhookEventRecord>;
  findWebhookByDedupe(args: {
    readonly provider: string;
    readonly channelAccountId: string | null;
    readonly externalEventId: string;
  }): Promise<WebhookEventRecord | null>;

  createOutboundMessage(args: {
    readonly tenantId: string;
    readonly messageId: UuidV7;
    readonly channelAccountId: string;
    readonly idempotencyKey: string | null;
    readonly contentType: string;
    readonly contentSnapshot: Record<string, unknown>;
    readonly actorId: string;
  }): Promise<OutboundMessageRecord>;
  getOutboundMessage(args: {
    readonly tenantId: string;
    readonly messageId: string;
  }): Promise<OutboundMessageRecord | null>;
  updateOutboundMessage(args: {
    readonly tenantId: string;
    readonly messageId: string;
    readonly expectedVersion: number | null;
    readonly status: OutboundStatus;
    readonly providerMessageId?: string | null;
    readonly blockedReason?: string | null;
    readonly actorId: string;
  }): Promise<OutboundMessageRecord>;
  addOutboundAttempt(args: {
    readonly tenantId: string;
    readonly attemptId: UuidV7;
    readonly outboundMessageId: string;
    readonly attemptNumber: number;
    readonly providerRequestId: string | null;
    readonly responseClass: string | null;
    readonly latencyMs: number | null;
    readonly retryAt: string | null;
    readonly error: string | null;
  }): Promise<OutboundAttemptRecord>;

  getIdempotentResource(tenantId: string, key: string): Promise<ChannelAccountResource | null>;
  saveIdempotentResource(tenantId: string, key: string, resource: ChannelAccountResource): Promise<void>;
  getIdempotentConnectMeta(
    tenantId: string,
    key: string
  ): Promise<{ readonly oauth_url: string; readonly state: string } | null>;
  saveIdempotentConnectMeta(
    tenantId: string,
    key: string,
    meta: { readonly oauth_url: string; readonly state: string }
  ): Promise<void>;
  getIdempotentJobResponse(
    tenantId: string,
    key: string
  ): Promise<{ readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null } | null>;
  saveIdempotentJobResponse(
    tenantId: string,
    key: string,
    response: { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null }
  ): Promise<void>;
}

const REQUIRED_SCOPES: Record<string, readonly string[]> = {
  facebook: ["pages_messaging", "pages_manage_metadata"],
  zalo: ["send_message"]
};

function nowIso(): string {
  return new Date().toISOString();
}

function accountToResource(account: ChannelAccountRecord): ChannelAccountResource {
  return {
    id: account.id,
    tenant_id: account.tenantId,
    provider: account.provider,
    display_name: account.displayName,
    status: account.status,
    health: account.health,
    version: account.version,
    created_at: account.createdAt,
    updated_at: account.updatedAt
  };
}

function webhookToResource(event: WebhookEventRecord): WebhookEventResource {
  return {
    id: event.id,
    tenant_id: event.tenantId,
    provider: event.provider,
    event_type: event.eventType,
    status: event.status,
    received_at: event.receivedAt
  };
}

export function requireChannelPermission(
  actorPermissions: readonly string[],
  permission: ChannelPermission
): void {
  if (!actorPermissions.includes(permission)) {
    throw new ChannelError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

async function withIdempotency(
  repo: ChannelRepository,
  tenantId: string,
  idempotencyKey: string | null | undefined,
  run: () => Promise<ChannelAccountResource>
): Promise<ChannelAccountResource> {
  const key = idempotencyKey?.trim();
  if (!key) {
    throw new ChannelError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const cached = await repo.getIdempotentResource(tenantId, key);
  if (cached) return cached;
  const result = await run();
  await repo.saveIdempotentResource(tenantId, key, result);
  return result;
}

async function withJobIdempotency(
  repo: ChannelRepository,
  tenantId: string,
  idempotencyKey: string | null | undefined,
  run: () => Promise<{ readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null }>
): Promise<{ readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null }> {
  const key = idempotencyKey?.trim();
  if (!key) {
    throw new ChannelError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const cached = await repo.getIdempotentJobResponse(tenantId, key);
  if (cached) return cached;
  const result = await run();
  await repo.saveIdempotentJobResponse(tenantId, key, result);
  return result;
}

export async function refreshAccountHealthSnapshot(options: {
  readonly repo: ChannelRepository;
  readonly tenantId: string;
  readonly account: ChannelAccountRecord;
  readonly actorId: string;
  readonly webhookLagSeconds?: number | null;
  readonly sendFailureRatio?: number | null;
  readonly providerOutage?: boolean;
}): Promise<ChannelAccountRecord> {
  const required = REQUIRED_SCOPES[options.account.provider] ?? [];
  const health = computeAccountHealth({
    tokenExpiresAt: options.account.tokenExpiresAt,
    grantedScopes: options.account.grantedScopes,
    requiredScopes: required,
    webhookLagSeconds: options.webhookLagSeconds ?? null,
    sendFailureRatio: options.sendFailureRatio ?? null,
    providerOutage: options.providerOutage ?? false
  });
  const missing = missingScopes(options.account.grantedScopes, required);
  if (missing.length > 0 && options.account.status === "active") {
    return options.repo.updateAccount({
      tenantId: options.tenantId,
      accountId: options.account.id,
      expectedVersion: options.account.version,
      patch: {
        health,
        status: deriveAccountStatus({ health, lifecycle: "connected" }),
        lastError: `Missing scopes: ${missing.join(",")}`
      },
      actorId: options.actorId
    });
  }
  if (options.account.tokenExpiresAt && new Date(options.account.tokenExpiresAt).getTime() <= Date.now()) {
    return options.repo.updateAccount({
      tenantId: options.tenantId,
      accountId: options.account.id,
      expectedVersion: options.account.version,
      patch: {
        health: "error",
        status: "degraded",
        lastError: "Token expired"
      },
      actorId: options.actorId
    });
  }
  return options.repo.updateAccount({
    tenantId: options.tenantId,
    accountId: options.account.id,
    expectedVersion: options.account.version,
    patch: {
      health,
      status: deriveAccountStatus({
        health,
        lifecycle: options.account.status === "revoked" ? "revoked" : "connected"
      }),
      lastSyncAt: nowIso(),
      lastError: null
    },
    actorId: options.actorId
  });
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function listChannelAccounts(options: {
  readonly repo: ChannelRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}): Promise<{
  readonly data: readonly ChannelAccountResource[];
  readonly page_info: { readonly next_cursor: null; readonly has_more: false };
  readonly meta: Record<string, never>;
}> {
  requireChannelPermission(options.actorPermissions, "channel.read");
  const accounts = await options.repo.listAccounts(options.tenantId);
  return {
    data: accounts.map(accountToResource),
    page_info: { next_cursor: null, has_more: false },
    meta: {}
  };
}

export async function getChannelAccount(options: {
  readonly repo: ChannelRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly accountId: string;
}): Promise<{ readonly data: ChannelAccountResource; readonly meta: Record<string, never> }> {
  requireChannelPermission(options.actorPermissions, "channel.read");
  const account = await options.repo.getAccount({ tenantId: options.tenantId, accountId: options.accountId });
  if (!account) {
    throw new ChannelError("Channel account not found.", "RESOURCE_NOT_FOUND");
  }
  return { data: accountToResource(account), meta: {} };
}

export async function connectChannel(options: {
  readonly repo: ChannelRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly provider: string;
  readonly displayName?: string | null;
  readonly oauthReturnPath?: string | null;
  readonly redirectUri?: string;
}): Promise<{
  readonly data: ChannelAccountResource;
  readonly meta: { readonly oauth_url: string; readonly state: string };
}> {
  requireChannelPermission(options.actorPermissions, "channel.connect");
  const provider = options.provider?.trim() ?? "";
  if (!provider || provider.length > 100) {
    throw new ChannelError("Invalid provider.", "VALIDATION_FAILED");
  }
  const key = options.idempotencyKey?.trim();
  if (!key) {
    throw new ChannelError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const cached = await options.repo.getIdempotentResource(options.tenantId, key);
  if (cached) {
    const cachedMeta = await options.repo.getIdempotentConnectMeta(options.tenantId, key);
    if (cachedMeta) {
      return { data: cached, meta: cachedMeta };
    }
  }
  const accountId = generateUuidV7();
  const externalAccountId = `pending-${accountId.slice(0, 8)}`;
  const account = await options.repo.createAccount({
    tenantId: options.tenantId,
    accountId,
    provider,
    externalAccountId,
    displayName: options.displayName?.trim() ?? null,
    actorId: options.actorId
  });
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const stateToken = generateOAuthStateToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await options.repo.saveOAuthState({
    tenantId: options.tenantId,
    stateId: generateUuidV7(),
    provider,
    stateToken,
    codeVerifierHash: hashCodeVerifier(codeVerifier),
    redirectReturnPath: options.oauthReturnPath ?? null,
    channelAccountId: account.id,
    expiresAt
  });
  const oauthUrl = buildOAuthAuthorizeUrlStub({
    provider,
    stateToken,
    codeChallenge,
    redirectUri: options.redirectUri ?? "https://api.stub/oauth/callback"
  });
  const data = accountToResource(account);
  const meta = { oauth_url: oauthUrl, state: stateToken };
  await options.repo.saveIdempotentResource(options.tenantId, key, data);
  await options.repo.saveIdempotentConnectMeta(options.tenantId, key, meta);
  return { data, meta };
}

export async function handleOAuthCallback(options: {
  readonly repo: ChannelRepository;
  readonly tenantId: string;
  readonly provider: string;
  readonly state: string;
  readonly code: string;
  readonly codeVerifier: string;
}): Promise<{ readonly data: ChannelAccountResource; readonly meta: Record<string, never> }> {
  const oauth = await options.repo.consumeOAuthState({
    stateToken: options.state,
    codeVerifier: options.codeVerifier
  });
  if (!oauth || oauth.provider !== options.provider || oauth.tenantId !== options.tenantId) {
    throw new ChannelError("Invalid OAuth state.", "VALIDATION_FAILED");
  }
  if (isOAuthStateExpired(oauth.expiresAt)) {
    throw new ChannelError("OAuth state expired.", "CHANNEL_TOKEN_EXPIRED");
  }
  if (!oauth.channelAccountId) {
    throw new ChannelError("Channel account not found.", "RESOURCE_NOT_FOUND");
  }
  const account = await options.repo.getAccount({
    tenantId: options.tenantId,
    accountId: oauth.channelAccountId
  });
  if (!account) {
    throw new ChannelError("Channel account not found.", "RESOURCE_NOT_FOUND");
  }
  const credential = await options.repo.saveCredential({
    tenantId: options.tenantId,
    credentialId: generateUuidV7(),
    channelAccountId: account.id,
    vaultRef: `vault://${options.provider}/${options.code.slice(0, 8)}`,
    expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
  });
  const updated = await options.repo.updateAccount({
    tenantId: options.tenantId,
    accountId: account.id,
    expectedVersion: account.version,
    patch: {
      status: "active",
      health: "ok",
      credentialId: credential.id,
      tokenExpiresAt: credential.expiresAt,
      grantedScopes: REQUIRED_SCOPES[options.provider] ?? [],
      lastSyncAt: nowIso(),
      lastError: null
    },
    actorId: account.id
  });
  return { data: accountToResource(updated), meta: {} };
}

export async function disconnectChannel(options: {
  readonly repo: ChannelRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly accountId: string;
}): Promise<{ readonly data: ChannelAccountResource; readonly meta: Record<string, never> }> {
  requireChannelPermission(options.actorPermissions, "channel.manage");
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const account = await options.repo.getAccount({ tenantId: options.tenantId, accountId: options.accountId });
    if (!account) {
      throw new ChannelError("Channel account not found.", "RESOURCE_NOT_FOUND");
    }
    const updated = await options.repo.updateAccount({
      tenantId: options.tenantId,
      accountId: options.accountId,
      expectedVersion: account.version,
      patch: { status: "disconnected", health: "error", lastError: "Disconnected by user" },
      actorId: options.actorId
    });
    return accountToResource(updated);
  });
  return { data, meta: {} };
}

export async function refreshChannelHealth(options: {
  readonly repo: ChannelRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly accountId: string;
}): Promise<{
  readonly data: { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null };
  readonly meta: Record<string, never>;
}> {
  requireChannelPermission(options.actorPermissions, "channel.manage");
  const data = await withJobIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const account = await options.repo.getAccount({ tenantId: options.tenantId, accountId: options.accountId });
    if (!account) {
      throw new ChannelError("Channel account not found.", "RESOURCE_NOT_FOUND");
    }
    if (account.status === "disconnected" || account.status === "revoked") {
      throw new ChannelError("Channel is not connected.", "CHANNEL_NOT_CONNECTED");
    }
    await refreshAccountHealthSnapshot({
      repo: options.repo,
      tenantId: options.tenantId,
      account,
      actorId: options.actorId
    });
    const jobId = generateUuidV7();
    return {
      job_id: jobId,
      status: "completed" as const,
      status_url: `/api/v1/channels/accounts/${options.accountId}`
    };
  });
  return { data, meta: {} };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export function extractExternalEventId(payload: Record<string, unknown>): string {
  const entry = Array.isArray(payload.entry) ? payload.entry[0] : null;
  if (entry && typeof entry === "object") {
    const messaging = (entry as Record<string, unknown>).messaging;
    if (Array.isArray(messaging) && messaging[0] && typeof messaging[0] === "object") {
      const item = messaging[0] as Record<string, unknown>;
      const nested = item.message && typeof item.message === "object"
        ? (item.message as Record<string, unknown>)
        : null;
      const mid = nested?.mid ?? item.mid;
      if (typeof mid === "string") return mid;
    }
    const id = (entry as Record<string, unknown>).id;
    if (typeof id === "string") return id;
  }
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}

export async function receiveWebhook(options: {
  readonly repo: ChannelRepository;
  readonly adapter: ChannelProviderAdapter;
  readonly provider: string;
  readonly rawBody: Buffer;
  readonly signatureHeader: string | null;
  readonly secretRef: string;
  readonly tenantId: string | null;
  readonly channelAccountId: string | null;
}): Promise<{
  readonly data: WebhookEventResource;
  readonly meta: { readonly duplicate: boolean; readonly ack: "fast" };
}> {
  const signatureValid = options.adapter.verifyWebhookSignature(
    {
      provider: options.provider,
      rawBody: options.rawBody,
      signatureHeader: options.signatureHeader,
      headers: {}
    },
    options.secretRef
  );
  if (!signatureValid) {
    throw new ChannelError("Webhook signature invalid.", "WEBHOOK_SIGNATURE_INVALID");
  }
  const payload = options.adapter.parseWebhookPayload(options.rawBody);
  const externalEventId = extractExternalEventId(payload);
  const existing = await options.repo.findWebhookByDedupe({
    provider: options.provider,
    channelAccountId: options.channelAccountId,
    externalEventId
  });
  if (existing) {
    return {
      data: webhookToResource(existing),
      meta: { duplicate: true, ack: "fast" }
    };
  }
  const inserted = await options.repo.insertWebhookEvent({
    eventId: generateUuidV7(),
    tenantId: options.tenantId,
    channelAccountId: options.channelAccountId,
    provider: options.provider,
    externalEventId,
    eventType: typeof payload.object === "string" ? payload.object : null,
    signatureValid: true,
    payloadDigest: digestRawBody(options.rawBody),
    payloadRedacted: redactWebhookPayload(payload)
  });
  if (inserted.duplicate) {
    return {
      data: webhookToResource(inserted.record),
      meta: { duplicate: true, ack: "fast" }
    };
  }
  void processWebhookEvent({
    repo: options.repo,
    adapter: options.adapter,
    tenantId: options.tenantId,
    eventId: inserted.record.id
  });
  return {
    data: webhookToResource(inserted.record),
    meta: { duplicate: false, ack: "fast" }
  };
}

export async function processWebhookEvent(options: {
  readonly repo: ChannelRepository;
  readonly adapter: ChannelProviderAdapter;
  readonly tenantId: string | null;
  readonly eventId: string;
}): Promise<WebhookEventRecord | null> {
  if (!options.tenantId) return null;
  const event = await options.repo.getWebhookEvent({ tenantId: options.tenantId, eventId: options.eventId });
  if (!event) return null;
  try {
    const normalized = options.adapter.normalizeEvent(
      event.provider,
      event.payloadRedacted
    );
    if (!normalized) {
      return options.repo.updateWebhookEvent({
        tenantId: options.tenantId,
        eventId: options.eventId,
        status: "failed",
        attemptCount: event.attemptCount + 1,
        error: "Unsupported event type",
        processedAt: nowIso()
      });
    }
    return options.repo.updateWebhookEvent({
      tenantId: options.tenantId,
      eventId: options.eventId,
      status: "normalized",
      attemptCount: event.attemptCount + 1,
      normalizedEntityId: digestNormalizedEntity(normalized),
      processedAt: nowIso()
    });
  } catch (error) {
    const attemptCount = event.attemptCount + 1;
    const action = classifyQueueError(error);
    if (action === "dead_letter" || shouldMoveToDlq(attemptCount)) {
      return options.repo.updateWebhookEvent({
        tenantId: options.tenantId,
        eventId: options.eventId,
        status: "dead_letter",
        attemptCount,
        error: error instanceof Error ? error.message : "Processing failed",
        processedAt: nowIso()
      });
    }
    return options.repo.updateWebhookEvent({
      tenantId: options.tenantId,
      eventId: options.eventId,
      status: "failed",
      attemptCount,
      nextRetryAt: scheduleRetryAt(attemptCount),
      error: error instanceof Error ? error.message : "Processing failed"
    });
  }
}

function digestNormalizedEntity(event: NormalizedChannelEvent): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex").slice(0, 32);
}

export async function listWebhookEventsApi(options: {
  readonly repo: ChannelRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}): Promise<{
  readonly data: readonly WebhookEventResource[];
  readonly page_info: { readonly next_cursor: null; readonly has_more: false };
  readonly meta: Record<string, never>;
}> {
  requireChannelPermission(options.actorPermissions, "channel.manage");
  const events = await options.repo.listWebhookEvents(options.tenantId);
  return {
    data: events.map(webhookToResource),
    page_info: { next_cursor: null, has_more: false },
    meta: {}
  };
}

export async function getWebhookEventApi(options: {
  readonly repo: ChannelRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly eventId: string;
}): Promise<{ readonly data: WebhookEventResource; readonly meta: Record<string, never> }> {
  requireChannelPermission(options.actorPermissions, "channel.manage");
  const event = await options.repo.getWebhookEvent({ tenantId: options.tenantId, eventId: options.eventId });
  if (!event) {
    throw new ChannelError("Webhook event not found.", "RESOURCE_NOT_FOUND");
  }
  return { data: webhookToResource(event), meta: {} };
}

export async function reprocessWebhookEvent(options: {
  readonly repo: ChannelRepository;
  readonly adapter: ChannelProviderAdapter;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly eventId: string;
}): Promise<{
  readonly data: { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null };
  readonly meta: Record<string, never>;
}> {
  requireChannelPermission(options.actorPermissions, "ops.reprocess");
  const data = await withJobIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const event = await options.repo.getWebhookEvent({ tenantId: options.tenantId, eventId: options.eventId });
    if (!event) {
      throw new ChannelError("Webhook event not found.", "RESOURCE_NOT_FOUND");
    }
    await options.repo.updateWebhookEvent({
      tenantId: options.tenantId,
      eventId: options.eventId,
      status: "reprocessed"
    });
    void processWebhookEvent({
      repo: options.repo,
      adapter: options.adapter,
      tenantId: options.tenantId,
      eventId: options.eventId
    });
    return {
      job_id: generateUuidV7(),
      status: "queued" as const,
      status_url: `/api/v1/webhook-events/${options.eventId}`
    };
  });
  return { data, meta: {} };
}

// ---------------------------------------------------------------------------
// Outbound
// ---------------------------------------------------------------------------

export async function queueOutboundMessage(options: {
  readonly repo: ChannelRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly channelAccountId: string;
  readonly idempotencyKey: string;
  readonly contentType: string;
  readonly text: string;
  readonly rateBucket?: RateLimitBucket;
  readonly circuit?: CircuitBreakerState;
}): Promise<OutboundMessageRecord> {
  const account = await options.repo.getAccount({
    tenantId: options.tenantId,
    accountId: options.channelAccountId
  });
  if (!account || account.status !== "active") {
    throw new ChannelError("Channel is not connected.", "CHANNEL_NOT_CONNECTED");
  }
  if (account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() <= Date.now()) {
    throw new ChannelError("Channel token expired.", "CHANNEL_TOKEN_EXPIRED");
  }
  if (options.circuit && !circuitAllowsRequest(options.circuit)) {
    throw new ChannelError("Message send blocked by circuit breaker.", "MESSAGE_SEND_BLOCKED");
  }
  if (options.rateBucket) {
    const consumed = consumeRateLimitToken(options.rateBucket);
    if (!consumed.allowed) {
      throw new ChannelError("Message send blocked by rate limit.", "MESSAGE_SEND_BLOCKED");
    }
  }
  return options.repo.createOutboundMessage({
    tenantId: options.tenantId,
    messageId: generateUuidV7(),
    channelAccountId: options.channelAccountId,
    idempotencyKey: options.idempotencyKey,
    contentType: options.contentType,
    contentSnapshot: { text: options.text },
    actorId: options.actorId
  });
}

export async function sendOutboundMessage(options: {
  readonly repo: ChannelRepository;
  readonly adapter: ChannelProviderAdapter;
  readonly tenantId: string;
  readonly actorId: string;
  readonly messageId: string;
  readonly secretRef: string;
  readonly externalThreadId: string;
}): Promise<OutboundMessageRecord> {
  const message = await options.repo.getOutboundMessage({
    tenantId: options.tenantId,
    messageId: options.messageId
  });
  if (!message) {
    throw new ChannelError("Outbound message not found.", "RESOURCE_NOT_FOUND");
  }
  assertOutboundTransition(message.status, "sending");
  const sending = await options.repo.updateOutboundMessage({
    tenantId: options.tenantId,
    messageId: options.messageId,
    expectedVersion: message.version,
    status: "sending",
    actorId: options.actorId
  });
  const text = typeof message.contentSnapshot.text === "string" ? message.contentSnapshot.text : "";
  const result = await options.adapter.sendMessage(
    {
      channelAccountId: message.channelAccountId,
      externalThreadId: options.externalThreadId,
      contentType: message.contentType,
      text,
      idempotencyKey: message.idempotencyKey ?? message.id
    },
    options.secretRef
  );
  await options.repo.addOutboundAttempt({
    tenantId: options.tenantId,
    attemptId: generateUuidV7(),
    outboundMessageId: message.id,
    attemptNumber: 1,
    providerRequestId: result.providerMessageId,
    responseClass: result.responseClass,
    latencyMs: result.latencyMs,
    retryAt: result.responseClass === "transient" ? scheduleRetryAt(1) : null,
    error: result.error
  });
  const nextStatus = mapProviderResponseToStatus(result.responseClass);
  assertOutboundTransition("sending", nextStatus);
  return options.repo.updateOutboundMessage({
    tenantId: options.tenantId,
    messageId: options.messageId,
    expectedVersion: sending.version,
    status: nextStatus,
    providerMessageId: result.providerMessageId,
    actorId: options.actorId
  });
}

export async function getOutboundMessageApi(options: {
  readonly repo: ChannelRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly messageId: string;
}): Promise<{
  readonly data: ChannelAccountResource;
  readonly meta: {
    readonly outbound_message_id: string;
    readonly status: OutboundStatus;
    readonly provider_message_id: string | null;
  };
}> {
  requireChannelPermission(options.actorPermissions, "channel.read");
  const message = await options.repo.getOutboundMessage({
    tenantId: options.tenantId,
    messageId: options.messageId
  });
  if (!message) {
    throw new ChannelError("Outbound message not found.", "RESOURCE_NOT_FOUND");
  }
  const account = await options.repo.getAccount({
    tenantId: options.tenantId,
    accountId: message.channelAccountId
  });
  if (!account) {
    throw new ChannelError("Channel account not found.", "RESOURCE_NOT_FOUND");
  }
  return {
    data: accountToResource(account),
    meta: {
      outbound_message_id: message.id,
      status: message.status,
      provider_message_id: message.providerMessageId
    }
  };
}

export async function retryOutboundMessageApi(options: {
  readonly repo: ChannelRepository;
  readonly adapter: ChannelProviderAdapter;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly messageId: string;
  readonly secretRef: string;
  readonly externalThreadId: string;
}): Promise<{
  readonly data: { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null };
  readonly meta: Record<string, never>;
}> {
  requireChannelPermission(options.actorPermissions, "channel.send");
  const data = await withJobIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const message = await options.repo.getOutboundMessage({
      tenantId: options.tenantId,
      messageId: options.messageId
    });
    if (!message) {
      throw new ChannelError("Outbound message not found.", "RESOURCE_NOT_FOUND");
    }
    if (!canRetryOutbound(message.status)) {
      throw new ChannelError("Outbound message cannot be retried.", "VALIDATION_FAILED");
    }
    await options.repo.updateOutboundMessage({
      tenantId: options.tenantId,
      messageId: options.messageId,
      expectedVersion: message.version,
      status: "queued",
      actorId: options.actorId
    });
    void sendOutboundMessage({
      repo: options.repo,
      adapter: options.adapter,
      tenantId: options.tenantId,
      actorId: options.actorId,
      messageId: options.messageId,
      secretRef: options.secretRef,
      externalThreadId: options.externalThreadId
    });
    return {
      job_id: generateUuidV7(),
      status: "queued" as const,
      status_url: `/api/v1/outbound-messages/${options.messageId}`
    };
  });
  return { data, meta: {} };
}

export { verifyWebhookSignatureStub, recordCircuitFailure };
