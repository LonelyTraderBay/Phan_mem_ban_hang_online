import type { IdempotencyStore } from "@ai-sales/idempotency";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  advanceMalwareScanStub,
  canDownloadAttachment,
  issueAttachmentDownloadTokenStub,
  type MalwareScanState
} from "../domain/attachment.js";
import type { NormalizedConversationEvent, NormalizedInboundMessage } from "../domain/inbound.js";
import { computeLeadScoreV1, detectPurchaseIntent } from "../domain/lead-score.js";
import {
  authorizeSseStreamStub,
  fanOutConversationEventStub,
  replayEventsSinceStub,
  type SseEventEnvelope
} from "../domain/sse.js";
import { computeSlaDueAt, markSlaBreachIfDue } from "../domain/sla.js";
import {
  applyEscalate,
  applyHumanTakeover,
  applyReleaseTakeover,
  applyReopen,
  applyResolve,
  canEscalate,
  canReopen,
  canResolve,
  canReleaseTakeover,
  canTakeover,
  onInboundMessage,
  onOutboundReply,
  toApiStatus,
  type AiMode,
  type ConversationApiStatus,
  type EscalationStatus,
  type LifecycleStatus,
  type SalesStage,
  type WaitingOn
} from "../domain/state.js";
import { runConversationIdempotent } from "./conversation-idempotency.js";

/**
 * BE-CON-001…012 — Conversation application layer (inbox, messages, assignment, SLA stubs).
 * In-memory until Postgres adapter. Mirrors channel/inventory style.
 */

export type ConversationPermission =
  | "conversation.read"
  | "conversation.reply"
  | "conversation.assign"
  | "conversation.takeover";

export type ConversationErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_VERSION_MISMATCH"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "CONVERSATION_STATE_INVALID"
  | "HUMAN_TAKEOVER_ACTIVE";

export class ConversationError extends Error {
  constructor(
    message: string,
    readonly code: ConversationErrorCode
  ) {
    super(message);
    this.name = "ConversationError";
  }
}

/** Frozen OpenAPI ConversationResource. */
export interface ConversationResource {
  readonly id: string;
  readonly tenant_id: string;
  readonly channel_account_id: string | null;
  readonly customer_id: string | null;
  readonly assignee_member_id: string | null;
  readonly status: ConversationApiStatus;
  readonly ai_takeover: boolean;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface MessageResource {
  readonly id: string;
  readonly tenant_id: string;
  readonly conversation_id: string;
  readonly direction: "inbound" | "outbound" | "internal";
  readonly content_type: string;
  readonly body: string | null;
  readonly ai_generated: boolean;
  readonly created_at: string;
}

export type JobResponseStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ConversationRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly channelAccountId: string | null;
  readonly customerId: string | null;
  readonly externalThreadId: string;
  readonly lifecycleStatus: LifecycleStatus;
  readonly waitingOn: WaitingOn;
  readonly salesStage: SalesStage;
  readonly escalationStatus: EscalationStatus;
  readonly aiMode: AiMode;
  readonly assigneeMemberId: string | null;
  readonly leadScore: number | null;
  readonly leadScoreRuleVersion: string | null;
  readonly leadScoreProvenance: Record<string, unknown>;
  readonly slaDueAt: string | null;
  readonly slaBreachedAt: string | null;
  readonly lastInboundAt: string | null;
  readonly lastOutboundAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MessageRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly direction: "inbound" | "outbound" | "internal";
  readonly externalMessageId: string | null;
  readonly senderIdentity: string | null;
  readonly contentType: string;
  readonly bodyRedacted: string | null;
  readonly replyToMessageId: string | null;
  readonly aiGenerated: boolean;
  readonly deliveryStatus: string | null;
  readonly sentAt: string | null;
  readonly receivedAt: string | null;
  readonly createdAt: string;
}

export interface AttachmentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly messageId: string;
  readonly objectKey: string;
  readonly malwareScanState: MalwareScanState;
  readonly expiresAt: string | null;
}

export interface AssignmentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly assigneeMemberId: string;
  readonly assignedBy: string | null;
  readonly unassignedAt: string | null;
  readonly createdAt: string;
}

export interface NoteRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly authorMemberId: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface OutboundQueuePort {
  queueReply(args: {
    readonly tenantId: string;
    readonly channelAccountId: string;
    readonly conversationId: string;
    readonly idempotencyKey: string;
    readonly text: string;
    readonly externalThreadId: string;
    readonly actorId: string;
  }): Promise<{ readonly outboundMessageId: string; readonly status: JobResponseStatus }>;
}

export interface ConversationRepository {
  findConversationByThread(args: {
    readonly tenantId: string;
    readonly channelAccountId: string;
    readonly externalThreadId: string;
  }): Promise<ConversationRecord | null>;

  createConversation(args: {
    readonly tenantId: string;
    readonly conversationId: UuidV7;
    readonly channelAccountId: string;
    readonly externalThreadId: string;
    readonly customerId: string | null;
    readonly actorId: string;
  }): Promise<ConversationRecord>;

  updateConversation(args: {
    readonly tenantId: string;
    readonly conversationId: string;
    readonly expectedVersion: number | null;
    readonly patch: Partial<
      Pick<
        ConversationRecord,
        | "lifecycleStatus"
        | "waitingOn"
        | "salesStage"
        | "escalationStatus"
        | "aiMode"
        | "assigneeMemberId"
        | "customerId"
        | "leadScore"
        | "leadScoreRuleVersion"
        | "leadScoreProvenance"
        | "slaDueAt"
        | "slaBreachedAt"
        | "lastInboundAt"
        | "lastOutboundAt"
      >
    >;
    readonly actorId: string;
  }): Promise<ConversationRecord>;

  listConversations(args: {
    readonly tenantId: string;
    readonly cursor: string | null;
    readonly limit: number;
  }): Promise<{ readonly items: readonly ConversationRecord[]; readonly nextCursor: string | null }>;

  getConversation(args: {
    readonly tenantId: string;
    readonly conversationId: string;
  }): Promise<ConversationRecord | null>;

  findMessageByExternal(args: {
    readonly tenantId: string;
    readonly conversationId: string;
    readonly externalMessageId: string;
  }): Promise<MessageRecord | null>;

  insertMessage(args: {
    readonly tenantId: string;
    readonly messageId: UuidV7;
    readonly conversationId: string;
    readonly direction: MessageRecord["direction"];
    readonly externalMessageId: string | null;
    readonly senderIdentity: string | null;
    readonly contentType: string;
    readonly bodyRedacted: string | null;
    readonly replyToMessageId: string | null;
    readonly aiGenerated: boolean;
    readonly receivedAt: string | null;
    readonly sentAt: string | null;
  }): Promise<MessageRecord>;

  listMessages(args: {
    readonly tenantId: string;
    readonly conversationId: string;
    readonly cursor: string | null;
    readonly limit: number;
  }): Promise<{ readonly items: readonly MessageRecord[]; readonly nextCursor: string | null }>;

  countInboundMessages(args: {
    readonly tenantId: string;
    readonly conversationId: string;
  }): Promise<number>;

  appendAssignment(args: {
    readonly tenantId: string;
    readonly assignmentId: UuidV7;
    readonly conversationId: string;
    readonly assigneeMemberId: string;
    readonly assignedBy: string;
  }): Promise<AssignmentRecord>;

  appendNote(args: {
    readonly tenantId: string;
    readonly noteId: UuidV7;
    readonly conversationId: string;
    readonly authorMemberId: string;
    readonly body: string;
  }): Promise<NoteRecord>;

  getAttachment(args: {
    readonly tenantId: string;
    readonly attachmentId: string;
  }): Promise<AttachmentRecord | null>;

  saveSseEvent(event: SseEventEnvelope): Promise<void>;
  listSseEvents(tenantId: string): Promise<readonly SseEventEnvelope[]>;

  getIdempotentConversation(
    tenantId: string,
    key: string
  ): Promise<ConversationResource | null>;
  saveIdempotentConversation(
    tenantId: string,
    key: string,
    resource: ConversationResource
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

  resolveCustomerStub(args: {
    readonly tenantId: string;
    readonly externalSenderId: string;
    readonly provider: string;
  }): Promise<string | null>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toResource(row: ConversationRecord): ConversationResource {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    channel_account_id: row.channelAccountId,
    customer_id: row.customerId,
    assignee_member_id: row.assigneeMemberId,
    status: toApiStatus({
      lifecycleStatus: row.lifecycleStatus,
      waitingOn: row.waitingOn,
      salesStage: row.salesStage,
      escalationStatus: row.escalationStatus,
      aiMode: row.aiMode
    }),
    ai_takeover: row.aiMode === "human_takeover",
    version: row.version,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function toMessageResource(row: MessageRecord): MessageResource {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    conversation_id: row.conversationId,
    direction: row.direction,
    content_type: row.contentType,
    body: row.bodyRedacted,
    ai_generated: row.aiGenerated,
    created_at: row.createdAt
  };
}

export function requireConversationPermission(
  actorPermissions: readonly string[],
  permission: ConversationPermission
): void {
  if (!actorPermissions.includes(permission)) {
    throw new ConversationError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

function stateInvalid(message: string): never {
  throw new ConversationError(message, "CONVERSATION_STATE_INVALID");
}

type JobIdempotencyResult = {
  readonly job_id: string;
  readonly status: JobResponseStatus;
  readonly status_url: string | null;
};

async function withConversationIdempotency(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly scope: string;
  readonly idempotencyKey: string | null | undefined;
  readonly idempotency: IdempotencyStore | undefined;
  readonly run: () => Promise<ConversationResource>;
}): Promise<ConversationResource> {
  const key = options.idempotencyKey?.trim();
  if (!key) {
    throw new ConversationError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  return runConversationIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: options.scope,
    key,
    loadCached: () => options.repo.getIdempotentConversation(options.tenantId, key),
    rememberCached: (resource) =>
      options.repo.saveIdempotentConversation(options.tenantId, key, resource),
    execute: options.run,
    resourceId: (resource) => resource.id
  });
}

async function withJobIdempotency(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly scope: string;
  readonly idempotencyKey: string | null | undefined;
  readonly idempotency: IdempotencyStore | undefined;
  readonly run: () => Promise<JobIdempotencyResult>;
}): Promise<JobIdempotencyResult> {
  const key = options.idempotencyKey?.trim();
  if (!key) {
    throw new ConversationError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  return runConversationIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: options.scope,
    key,
    loadCached: () => options.repo.getIdempotentJobResponse(options.tenantId, key),
    rememberCached: (response) =>
      options.repo.saveIdempotentJobResponse(options.tenantId, key, response),
    execute: options.run,
    resourceId: (response) => response.job_id
  });
}

async function getConversationOrThrow(
  repo: ConversationRepository,
  tenantId: string,
  conversationId: string
): Promise<ConversationRecord> {
  const row = await repo.getConversation({ tenantId, conversationId });
  if (!row) {
    throw new ConversationError("Conversation not found.", "RESOURCE_NOT_FOUND");
  }
  return row;
}

async function publishSse(
  repo: ConversationRepository,
  event: Omit<SseEventEnvelope, "id" | "occurredAt">
): Promise<void> {
  await repo.saveSseEvent({
    ...event,
    id: generateUuidV7(),
    occurredAt: nowIso()
  });
}

// ---------------------------------------------------------------------------
// BE-CON-002 inbound upsert
// ---------------------------------------------------------------------------

export async function upsertInboundNormalizedEvent(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly channelAccountId: string;
  readonly event: NormalizedConversationEvent;
  readonly actorId: string;
}): Promise<{
  readonly conversation: ConversationRecord;
  readonly message: MessageRecord | null;
  readonly duplicate: boolean;
}> {
  if (options.event.kind === "identity") {
    const customerId = await options.repo.resolveCustomerStub({
      tenantId: options.tenantId,
      externalSenderId: options.event.externalUserId,
      provider: options.event.provider
    });
    const existing = await options.repo.findConversationByThread({
      tenantId: options.tenantId,
      channelAccountId: options.channelAccountId,
      externalThreadId: options.event.externalUserId
    });
    if (existing) {
      const updated = await options.repo.updateConversation({
        tenantId: options.tenantId,
        conversationId: existing.id,
        expectedVersion: existing.version,
        patch: { customerId: customerId ?? existing.customerId },
        actorId: options.actorId
      });
      return { conversation: updated, message: null, duplicate: false };
    }
    const created = await options.repo.createConversation({
      tenantId: options.tenantId,
      conversationId: generateUuidV7(),
      channelAccountId: options.channelAccountId,
      externalThreadId: options.event.externalUserId,
      customerId,
      actorId: options.actorId
    });
    return { conversation: created, message: null, duplicate: false };
  }

  const msg = options.event;
  let conversation = await options.repo.findConversationByThread({
    tenantId: options.tenantId,
    channelAccountId: options.channelAccountId,
    externalThreadId: msg.externalThreadId
  });
  if (!conversation) {
    const customerId = await options.repo.resolveCustomerStub({
      tenantId: options.tenantId,
      externalSenderId: msg.externalSenderId,
      provider: msg.provider
    });
    conversation = await options.repo.createConversation({
      tenantId: options.tenantId,
      conversationId: generateUuidV7(),
      channelAccountId: options.channelAccountId,
      externalThreadId: msg.externalThreadId,
      customerId,
      actorId: options.actorId
    });
  }

  const dup = await options.repo.findMessageByExternal({
    tenantId: options.tenantId,
    conversationId: conversation.id,
    externalMessageId: msg.externalMessageId
  });
  if (dup) {
    return { conversation, message: dup, duplicate: true };
  }

  const inboundCount = await options.repo.countInboundMessages({
    tenantId: options.tenantId,
    conversationId: conversation.id
  });
  const lead = computeLeadScoreV1({
    inboundMessageCount: inboundCount + 1,
    hasPurchaseIntentKeywords: detectPurchaseIntent(msg.text),
    escalationStatus: conversation.escalationStatus
  });
  const nextState = onInboundMessage({
    lifecycleStatus: conversation.lifecycleStatus,
    waitingOn: conversation.waitingOn,
    salesStage: conversation.salesStage,
    escalationStatus: conversation.escalationStatus,
    aiMode: conversation.aiMode
  });
  const slaDueAt =
    conversation.slaDueAt ??
    computeSlaDueAt({ startedAt: new Date(msg.receivedAt), responseMinutes: 30 });
  const slaBreachedAt = markSlaBreachIfDue({
    slaDueAt,
    slaBreachedAt: conversation.slaBreachedAt
  });

  conversation = await options.repo.updateConversation({
    tenantId: options.tenantId,
    conversationId: conversation.id,
    expectedVersion: conversation.version,
    patch: {
      lifecycleStatus: nextState.lifecycleStatus,
      waitingOn: nextState.waitingOn,
      leadScore: lead.score,
      leadScoreRuleVersion: lead.ruleVersion,
      leadScoreProvenance: lead.provenance,
      slaDueAt,
      slaBreachedAt,
      lastInboundAt: msg.receivedAt
    },
    actorId: options.actorId
  });

  const message = await options.repo.insertMessage({
    tenantId: options.tenantId,
    messageId: generateUuidV7(),
    conversationId: conversation.id,
    direction: "inbound",
    externalMessageId: msg.externalMessageId,
    senderIdentity: msg.externalSenderId,
    contentType: msg.contentType,
    bodyRedacted: msg.text,
    replyToMessageId: null,
    aiGenerated: false,
    receivedAt: msg.receivedAt,
    sentAt: null
  });

  await publishSse(options.repo, {
    type: "conversation.message.received.v1",
    tenantId: options.tenantId,
    conversationId: conversation.id,
    payload: { message_id: message.id, direction: "inbound" }
  });

  return { conversation, message, duplicate: false };
}

export function toNormalizedInboundMessage(event: {
  readonly provider: string;
  readonly externalMessageId: string;
  readonly externalThreadId: string;
  readonly externalSenderId: string;
  readonly contentType: string;
  readonly text: string | null;
  readonly receivedAt: string;
}): NormalizedInboundMessage {
  return {
    kind: "message",
    provider: event.provider,
    externalMessageId: event.externalMessageId,
    externalThreadId: event.externalThreadId,
    externalSenderId: event.externalSenderId,
    direction: "inbound",
    contentType: event.contentType,
    text: event.text,
    receivedAt: event.receivedAt
  };
}

// ---------------------------------------------------------------------------
// BE-CON-003 list/detail/messages
// ---------------------------------------------------------------------------

export async function listConversationsApi(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly cursor?: string | null;
  readonly limit?: number;
}): Promise<{
  readonly data: readonly ConversationResource[];
  readonly page_info: { readonly next_cursor: string | null; readonly has_more: boolean };
  readonly meta: Record<string, never>;
}> {
  requireConversationPermission(options.actorPermissions, "conversation.read");
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const page = await options.repo.listConversations({
    tenantId: options.tenantId,
    cursor: options.cursor ?? null,
    limit
  });
  return {
    data: page.items.map(toResource),
    page_info: {
      next_cursor: page.nextCursor,
      has_more: page.nextCursor !== null
    },
    meta: {}
  };
}

export async function getConversationApi(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly conversationId: string;
}): Promise<{ readonly data: ConversationResource; readonly meta: Record<string, never> }> {
  requireConversationPermission(options.actorPermissions, "conversation.read");
  const row = await getConversationOrThrow(options.repo, options.tenantId, options.conversationId);
  return { data: toResource(row), meta: {} };
}

export async function listConversationMessagesApi(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly conversationId: string;
  readonly cursor?: string | null;
  readonly limit?: number;
}): Promise<{
  readonly data: readonly MessageResource[];
  readonly page_info: { readonly next_cursor: string | null; readonly has_more: boolean };
  readonly meta: { readonly conversation_id: string };
}> {
  requireConversationPermission(options.actorPermissions, "conversation.read");
  await getConversationOrThrow(options.repo, options.tenantId, options.conversationId);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const page = await options.repo.listMessages({
    tenantId: options.tenantId,
    conversationId: options.conversationId,
    cursor: options.cursor ?? null,
    limit
  });
  return {
    data: page.items.map(toMessageResource),
    page_info: { next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
    meta: { conversation_id: options.conversationId }
  };
}

export async function updateConversationMetadataApi(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly conversationId: string;
  readonly expectedVersion: number;
  readonly metadata?: Record<string, unknown>;
}): Promise<{ readonly data: ConversationResource; readonly meta: Record<string, never> }> {
  requireConversationPermission(options.actorPermissions, "conversation.reply");
  const current = await getConversationOrThrow(options.repo, options.tenantId, options.conversationId);
  if (current.version !== options.expectedVersion) {
    throw new ConversationError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
  }
  const updated = await options.repo.updateConversation({
    tenantId: options.tenantId,
    conversationId: options.conversationId,
    expectedVersion: options.expectedVersion,
    patch: {},
    actorId: options.actorId
  });
  void options.metadata;
  return { data: toResource(updated), meta: {} };
}

// ---------------------------------------------------------------------------
// BE-CON-005 assignment + notes
// ---------------------------------------------------------------------------

export async function assignConversationApi(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly idempotency?: IdempotencyStore;
  readonly conversationId: string;
  readonly assigneeMemberId: string;
  readonly expectedVersion: number;
}): Promise<{ readonly data: ConversationResource; readonly meta: Record<string, never> }> {
  requireConversationPermission(options.actorPermissions, "conversation.assign");
  const data = await withConversationIdempotency({
    repo: options.repo,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "conversation.assign",
    idempotencyKey: options.idempotencyKey,
    idempotency: options.idempotency,
    run: async () => {
      const current = await getConversationOrThrow(
        options.repo,
        options.tenantId,
        options.conversationId
      );
      if (current.version !== options.expectedVersion) {
        throw new ConversationError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      await options.repo.appendAssignment({
        tenantId: options.tenantId,
        assignmentId: generateUuidV7(),
        conversationId: options.conversationId,
        assigneeMemberId: options.assigneeMemberId,
        assignedBy: options.actorId
      });
      const updated = await options.repo.updateConversation({
        tenantId: options.tenantId,
        conversationId: options.conversationId,
        expectedVersion: options.expectedVersion,
        patch: { assigneeMemberId: options.assigneeMemberId, waitingOn: "staff" },
        actorId: options.actorId
      });
      return toResource(updated);
    }
  });
  return { data, meta: {} };
}

export async function unassignConversationApi(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly idempotency?: IdempotencyStore;
  readonly conversationId: string;
  readonly expectedVersion: number;
}): Promise<{ readonly data: ConversationResource; readonly meta: Record<string, never> }> {
  requireConversationPermission(options.actorPermissions, "conversation.assign");
  const data = await withConversationIdempotency({
    repo: options.repo,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "conversation.unassign",
    idempotencyKey: options.idempotencyKey,
    idempotency: options.idempotency,
    run: async () => {
      const current = await getConversationOrThrow(
        options.repo,
        options.tenantId,
        options.conversationId
      );
      if (current.version !== options.expectedVersion) {
        throw new ConversationError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const updated = await options.repo.updateConversation({
        tenantId: options.tenantId,
        conversationId: options.conversationId,
        expectedVersion: options.expectedVersion,
        patch: { assigneeMemberId: null },
        actorId: options.actorId
      });
      return toResource(updated);
    }
  });
  return { data, meta: {} };
}

export async function addConversationNoteApi(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly idempotency?: IdempotencyStore;
  readonly conversationId: string;
  readonly body: string;
}): Promise<{ readonly data: ConversationResource; readonly meta: { readonly note_id: string } }> {
  requireConversationPermission(options.actorPermissions, "conversation.reply");
  const body = options.body?.trim() ?? "";
  if (!body) {
    throw new ConversationError("Note body is required.", "VALIDATION_FAILED");
  }
  type NoteResult = { readonly data: ConversationResource; readonly meta: { readonly note_id: string } };
  const key = options.idempotencyKey?.trim();
  if (!key) {
    throw new ConversationError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  return runConversationIdempotent<NoteResult>({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "conversation.note",
    key,
    loadCached: async () => {
      const cached = await options.repo.getIdempotentConversation(options.tenantId, key);
      return cached ? { data: cached, meta: { note_id: "" } } : null;
    },
    rememberCached: async (result) => {
      await options.repo.saveIdempotentConversation(options.tenantId, key, result.data);
    },
    execute: async () => {
      const current = await getConversationOrThrow(
        options.repo,
        options.tenantId,
        options.conversationId
      );
      const note = await options.repo.appendNote({
        tenantId: options.tenantId,
        noteId: generateUuidV7(),
        conversationId: options.conversationId,
        authorMemberId: options.actorId,
        body
      });
      return { data: toResource(current), meta: { note_id: note.id } };
    },
    resourceId: (result) => result.data.id
  });
}

// ---------------------------------------------------------------------------
// BE-CON-004/009 state commands
// ---------------------------------------------------------------------------

export async function resolveConversationApi(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly idempotency?: IdempotencyStore;
  readonly conversationId: string;
  readonly expectedVersion: number;
}): Promise<{ readonly data: ConversationResource; readonly meta: Record<string, never> }> {
  requireConversationPermission(options.actorPermissions, "conversation.reply");
  const data = await withConversationIdempotency({
    repo: options.repo,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "conversation.resolve",
    idempotencyKey: options.idempotencyKey,
    idempotency: options.idempotency,
    run: async () => {
      const current = await getConversationOrThrow(
        options.repo,
        options.tenantId,
        options.conversationId
      );
      if (current.version !== options.expectedVersion) {
        throw new ConversationError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const dims = {
        lifecycleStatus: current.lifecycleStatus,
        waitingOn: current.waitingOn,
        salesStage: current.salesStage,
        escalationStatus: current.escalationStatus,
        aiMode: current.aiMode
      };
      if (!canResolve(dims)) stateInvalid("Cannot resolve conversation in current state.");
      const next = applyResolve(dims);
      const updated = await options.repo.updateConversation({
        tenantId: options.tenantId,
        conversationId: options.conversationId,
        expectedVersion: options.expectedVersion,
        patch: {
          lifecycleStatus: next.lifecycleStatus,
          waitingOn: next.waitingOn
        },
        actorId: options.actorId
      });
      return toResource(updated);
    }
  });
  return { data, meta: {} };
}

export async function reopenConversationApi(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly idempotency?: IdempotencyStore;
  readonly conversationId: string;
  readonly expectedVersion: number;
}): Promise<{ readonly data: ConversationResource; readonly meta: Record<string, never> }> {
  requireConversationPermission(options.actorPermissions, "conversation.reply");
  const data = await withConversationIdempotency({
    repo: options.repo,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "conversation.reopen",
    idempotencyKey: options.idempotencyKey,
    idempotency: options.idempotency,
    run: async () => {
      const current = await getConversationOrThrow(
        options.repo,
        options.tenantId,
        options.conversationId
      );
      if (current.version !== options.expectedVersion) {
        throw new ConversationError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const dims = {
        lifecycleStatus: current.lifecycleStatus,
        waitingOn: current.waitingOn,
        salesStage: current.salesStage,
        escalationStatus: current.escalationStatus,
        aiMode: current.aiMode
      };
      if (!canReopen(dims)) stateInvalid("Cannot reopen conversation.");
      const next = applyReopen(dims);
      const updated = await options.repo.updateConversation({
        tenantId: options.tenantId,
        conversationId: options.conversationId,
        expectedVersion: options.expectedVersion,
        patch: {
          lifecycleStatus: next.lifecycleStatus,
          waitingOn: next.waitingOn
        },
        actorId: options.actorId
      });
      return toResource(updated);
    }
  });
  return { data, meta: {} };
}

export async function escalateConversationApi(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly idempotency?: IdempotencyStore;
  readonly conversationId: string;
  readonly expectedVersion: number;
}): Promise<{ readonly data: ConversationResource; readonly meta: Record<string, never> }> {
  requireConversationPermission(options.actorPermissions, "conversation.assign");
  const data = await withConversationIdempotency({
    repo: options.repo,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "conversation.escalate",
    idempotencyKey: options.idempotencyKey,
    idempotency: options.idempotency,
    run: async () => {
      const current = await getConversationOrThrow(
        options.repo,
        options.tenantId,
        options.conversationId
      );
      if (current.version !== options.expectedVersion) {
        throw new ConversationError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const dims = {
        lifecycleStatus: current.lifecycleStatus,
        waitingOn: current.waitingOn,
        salesStage: current.salesStage,
        escalationStatus: current.escalationStatus,
        aiMode: current.aiMode
      };
      if (!canEscalate(dims)) stateInvalid("Cannot escalate conversation.");
      const next = applyEscalate(dims);
      const updated = await options.repo.updateConversation({
        tenantId: options.tenantId,
        conversationId: options.conversationId,
        expectedVersion: options.expectedVersion,
        patch: {
          escalationStatus: next.escalationStatus,
          waitingOn: next.waitingOn
        },
        actorId: options.actorId
      });
      return toResource(updated);
    }
  });
  return { data, meta: {} };
}

export async function takeOverConversationApi(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly idempotency?: IdempotencyStore;
  readonly conversationId: string;
  readonly expectedVersion: number;
}): Promise<{ readonly data: ConversationResource; readonly meta: Record<string, never> }> {
  requireConversationPermission(options.actorPermissions, "conversation.takeover");
  const data = await withConversationIdempotency({
    repo: options.repo,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "conversation.takeover",
    idempotencyKey: options.idempotencyKey,
    idempotency: options.idempotency,
    run: async () => {
      const current = await getConversationOrThrow(
        options.repo,
        options.tenantId,
        options.conversationId
      );
      if (current.version !== options.expectedVersion) {
        throw new ConversationError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const dims = {
        lifecycleStatus: current.lifecycleStatus,
        waitingOn: current.waitingOn,
        salesStage: current.salesStage,
        escalationStatus: current.escalationStatus,
        aiMode: current.aiMode
      };
      if (!canTakeover(dims)) stateInvalid("Cannot take over conversation.");
      const next = applyHumanTakeover(dims);
      const updated = await options.repo.updateConversation({
        tenantId: options.tenantId,
        conversationId: options.conversationId,
        expectedVersion: options.expectedVersion,
        patch: { aiMode: next.aiMode, waitingOn: next.waitingOn },
        actorId: options.actorId
      });
      return toResource(updated);
    }
  });
  return { data, meta: {} };
}

export async function releaseConversationTakeoverApi(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly idempotency?: IdempotencyStore;
  readonly conversationId: string;
  readonly expectedVersion: number;
}): Promise<{ readonly data: ConversationResource; readonly meta: Record<string, never> }> {
  requireConversationPermission(options.actorPermissions, "conversation.takeover");
  const data = await withConversationIdempotency({
    repo: options.repo,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "conversation.release-takeover",
    idempotencyKey: options.idempotencyKey,
    idempotency: options.idempotency,
    run: async () => {
      const current = await getConversationOrThrow(
        options.repo,
        options.tenantId,
        options.conversationId
      );
      if (current.version !== options.expectedVersion) {
        throw new ConversationError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const dims = {
        lifecycleStatus: current.lifecycleStatus,
        waitingOn: current.waitingOn,
        salesStage: current.salesStage,
        escalationStatus: current.escalationStatus,
        aiMode: current.aiMode
      };
      if (!canReleaseTakeover(dims)) stateInvalid("Takeover not active.");
      const next = applyReleaseTakeover(dims);
      const updated = await options.repo.updateConversation({
        tenantId: options.tenantId,
        conversationId: options.conversationId,
        expectedVersion: options.expectedVersion,
        patch: { aiMode: next.aiMode },
        actorId: options.actorId
      });
      return toResource(updated);
    }
  });
  return { data, meta: {} };
}

// ---------------------------------------------------------------------------
// BE-CON-006 reply -> outbound queue
// ---------------------------------------------------------------------------

export async function sendConversationMessageApi(options: {
  readonly repo: ConversationRepository;
  readonly outbound: OutboundQueuePort;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly idempotency?: IdempotencyStore;
  readonly conversationId: string;
  readonly expectedVersion: number;
  readonly text: string;
}): Promise<{
  readonly data: { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null };
  readonly meta: Record<string, never>;
}> {
  requireConversationPermission(options.actorPermissions, "conversation.reply");
  const text = options.text?.trim() ?? "";
  if (!text) {
    throw new ConversationError("Message text is required.", "VALIDATION_FAILED");
  }
  const data = await withJobIdempotency({
    repo: options.repo,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "conversation.job.reply",
    idempotencyKey: options.idempotencyKey,
    idempotency: options.idempotency,
    run: async () => {
      const current = await getConversationOrThrow(
        options.repo,
        options.tenantId,
        options.conversationId
      );
      if (current.version !== options.expectedVersion) {
        throw new ConversationError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      if (current.aiMode === "human_takeover" && current.assigneeMemberId !== options.actorId) {
        throw new ConversationError("Human takeover active.", "HUMAN_TAKEOVER_ACTIVE");
      }
      if (!current.channelAccountId) {
        throw new ConversationError("Conversation has no channel.", "VALIDATION_FAILED");
      }
      const nextState = onOutboundReply({
        lifecycleStatus: current.lifecycleStatus,
        waitingOn: current.waitingOn,
        salesStage: current.salesStage,
        escalationStatus: current.escalationStatus,
        aiMode: current.aiMode
      });
      await options.repo.updateConversation({
        tenantId: options.tenantId,
        conversationId: options.conversationId,
        expectedVersion: options.expectedVersion,
        patch: {
          waitingOn: nextState.waitingOn,
          lastOutboundAt: nowIso()
        },
        actorId: options.actorId
      });
      const outbound = await options.outbound.queueReply({
        tenantId: options.tenantId,
        channelAccountId: current.channelAccountId,
        conversationId: current.id,
        idempotencyKey: options.idempotencyKey!.trim(),
        text,
        externalThreadId: current.externalThreadId,
        actorId: options.actorId
      });
      await options.repo.insertMessage({
        tenantId: options.tenantId,
        messageId: generateUuidV7(),
        conversationId: current.id,
        direction: "outbound",
        externalMessageId: null,
        senderIdentity: options.actorId,
        contentType: "text",
        bodyRedacted: text,
        replyToMessageId: null,
        aiGenerated: false,
        receivedAt: null,
        sentAt: nowIso()
      });
      return {
        job_id: outbound.outboundMessageId,
        status: outbound.status,
        status_url: `/api/v1/outbound-messages/${outbound.outboundMessageId}`
      };
    }
  });
  return { data, meta: {} };
}

// ---------------------------------------------------------------------------
// BE-CON-010/011 stubs exposed for controller/tests
// ---------------------------------------------------------------------------

export async function openRealtimeStreamStub(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly memberId: string;
  readonly permissions: readonly string[];
  readonly lastEventId?: string | null;
}): Promise<{
  readonly authorized: boolean;
  readonly events: readonly SseEventEnvelope[];
}> {
  const scope = authorizeSseStreamStub({
    tenantId: options.tenantId,
    memberId: options.memberId,
    permissions: options.permissions
  });
  if (!scope) return { authorized: false, events: [] };
  const all = await options.repo.listSseEvents(options.tenantId);
  const replayed = replayEventsSinceStub(all, options.lastEventId ?? null);
  const delivered = replayed.flatMap((event) => fanOutConversationEventStub(scope, event));
  return { authorized: true, events: delivered };
}

export async function downloadAttachmentStub(options: {
  readonly repo: ConversationRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly attachmentId: string;
}): Promise<{ readonly token: string | null; readonly allowed: boolean }> {
  requireConversationPermission(options.actorPermissions, "conversation.read");
  const attachment = await options.repo.getAttachment({
    tenantId: options.tenantId,
    attachmentId: options.attachmentId
  });
  if (!attachment) {
    throw new ConversationError("Attachment not found.", "RESOURCE_NOT_FOUND");
  }
  const scanned = {
    ...attachment,
    malwareScanState: advanceMalwareScanStub(attachment.malwareScanState)
  };
  const allowed = canDownloadAttachment(scanned);
  return {
    allowed,
    token: issueAttachmentDownloadTokenStub(scanned)
  };
}

export { authorizeSseStreamStub, fanOutConversationEventStub, replayEventsSinceStub };
