import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  ConversationError,
  type AssignmentRecord,
  type AttachmentRecord,
  type ConversationRecord,
  type ConversationRepository,
  type ConversationResource,
  type JobResponseStatus,
  type MessageRecord,
  type NoteRecord
} from "../../application/conversation.js";
import type { SseEventEnvelope } from "../../domain/sse.js";

function nowIso(): string {
  return new Date().toISOString();
}

function threadKey(channelAccountId: string, externalThreadId: string): string {
  return `${channelAccountId}:${externalThreadId}`;
}

export class InMemoryConversationRepository implements ConversationRepository {
  private readonly conversations = new Map<string, Map<string, ConversationRecord>>();
  private readonly threadIndex = new Map<string, string>();
  private readonly messages = new Map<string, Map<string, MessageRecord>>();
  private readonly messageExternal = new Map<string, MessageRecord>();
  private readonly assignments = new Map<string, AssignmentRecord[]>();
  private readonly notes = new Map<string, NoteRecord[]>();
  private readonly attachments = new Map<string, Map<string, AttachmentRecord>>();
  private readonly sseEvents = new Map<string, SseEventEnvelope[]>();
  private readonly idempotentConversations = new Map<string, ConversationResource>();
  private readonly idempotentJobs = new Map<
    string,
    { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null }
  >();
  private readonly customerStub = new Map<string, string>();

  private tenantMap<T>(store: Map<string, Map<string, T>>, tenantId: string): Map<string, T> {
    let map = store.get(tenantId);
    if (!map) {
      map = new Map();
      store.set(tenantId, map);
    }
    return map;
  }

  async findConversationByThread(args: {
    readonly tenantId: string;
    readonly channelAccountId: string;
    readonly externalThreadId: string;
  }): Promise<ConversationRecord | null> {
    const id = this.threadIndex.get(
      `${args.tenantId}:${threadKey(args.channelAccountId, args.externalThreadId)}`
    );
    if (!id) return null;
    return this.conversations.get(args.tenantId)?.get(id) ?? null;
  }

  async createConversation(args: {
    readonly tenantId: string;
    readonly conversationId: UuidV7;
    readonly channelAccountId: string;
    readonly externalThreadId: string;
    readonly customerId: string | null;
    readonly actorId: string;
  }): Promise<ConversationRecord> {
    const createdAt = nowIso();
    const row: ConversationRecord = {
      id: args.conversationId,
      tenantId: args.tenantId,
      channelAccountId: args.channelAccountId,
      customerId: args.customerId,
      externalThreadId: args.externalThreadId,
      lifecycleStatus: "new",
      waitingOn: "none",
      salesStage: "none",
      escalationStatus: "normal",
      aiMode: "copilot",
      assigneeMemberId: null,
      leadScore: null,
      leadScoreRuleVersion: null,
      leadScoreProvenance: {},
      slaDueAt: null,
      slaBreachedAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      version: 1,
      createdAt,
      updatedAt: createdAt
    };
    this.tenantMap(this.conversations, args.tenantId).set(args.conversationId, row);
    this.threadIndex.set(
      `${args.tenantId}:${threadKey(args.channelAccountId, args.externalThreadId)}`,
      args.conversationId
    );
    return row;
  }

  async updateConversation(args: {
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
  }): Promise<ConversationRecord> {
    const current = await this.getConversation({
      tenantId: args.tenantId,
      conversationId: args.conversationId
    });
    if (!current) {
      throw new ConversationError("Conversation not found.", "RESOURCE_NOT_FOUND");
    }
    if (args.expectedVersion !== null && current.version !== args.expectedVersion) {
      throw new ConversationError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
    }
    const updated: ConversationRecord = {
      ...current,
      ...args.patch,
      version: current.version + 1,
      updatedAt: nowIso()
    };
    this.tenantMap(this.conversations, args.tenantId).set(args.conversationId, updated);
    return updated;
  }

  async listConversations(args: {
    readonly tenantId: string;
    readonly cursor: string | null;
    readonly limit: number;
  }): Promise<{ readonly items: readonly ConversationRecord[]; readonly nextCursor: string | null }> {
    const all = [...(this.conversations.get(args.tenantId)?.values() ?? [])].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
    let start = 0;
    if (args.cursor) {
      const idx = all.findIndex((c) => c.id === args.cursor);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const slice = all.slice(start, start + args.limit);
    const nextCursor =
      start + args.limit < all.length ? (slice.at(-1)?.id ?? null) : null;
    return { items: slice, nextCursor };
  }

  async getConversation(args: {
    readonly tenantId: string;
    readonly conversationId: string;
  }): Promise<ConversationRecord | null> {
    return this.conversations.get(args.tenantId)?.get(args.conversationId) ?? null;
  }

  async findMessageByExternal(args: {
    readonly tenantId: string;
    readonly conversationId: string;
    readonly externalMessageId: string;
  }): Promise<MessageRecord | null> {
    return (
      this.messageExternal.get(
        `${args.tenantId}:${args.conversationId}:${args.externalMessageId}`
      ) ?? null
    );
  }

  async insertMessage(args: {
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
  }): Promise<MessageRecord> {
    const createdAt = nowIso();
    const row: MessageRecord = {
      id: args.messageId,
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      direction: args.direction,
      externalMessageId: args.externalMessageId,
      senderIdentity: args.senderIdentity,
      contentType: args.contentType,
      bodyRedacted: args.bodyRedacted,
      replyToMessageId: args.replyToMessageId,
      aiGenerated: args.aiGenerated,
      deliveryStatus: null,
      sentAt: args.sentAt,
      receivedAt: args.receivedAt,
      createdAt
    };
    const key = `${args.tenantId}:${args.conversationId}`;
    let bucket = this.messages.get(key);
    if (!bucket) {
      bucket = new Map();
      this.messages.set(key, bucket);
    }
    bucket.set(args.messageId, row);
    if (args.externalMessageId) {
      this.messageExternal.set(
        `${args.tenantId}:${args.conversationId}:${args.externalMessageId}`,
        row
      );
    }
    return row;
  }

  async listMessages(args: {
    readonly tenantId: string;
    readonly conversationId: string;
    readonly cursor: string | null;
    readonly limit: number;
  }): Promise<{ readonly items: readonly MessageRecord[]; readonly nextCursor: string | null }> {
    const all = [
      ...(this.messages.get(`${args.tenantId}:${args.conversationId}`)?.values() ?? [])
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    let start = 0;
    if (args.cursor) {
      const idx = all.findIndex((m) => m.id === args.cursor);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const slice = all.slice(start, start + args.limit);
    const nextCursor =
      start + args.limit < all.length ? (slice.at(-1)?.id ?? null) : null;
    return { items: slice, nextCursor };
  }

  async countInboundMessages(args: {
    readonly tenantId: string;
    readonly conversationId: string;
  }): Promise<number> {
    const all = this.messages.get(`${args.tenantId}:${args.conversationId}`)?.values() ?? [];
    return [...all].filter((m) => m.direction === "inbound").length;
  }

  async appendAssignment(args: {
    readonly tenantId: string;
    readonly assignmentId: UuidV7;
    readonly conversationId: string;
    readonly assigneeMemberId: string;
    readonly assignedBy: string;
  }): Promise<AssignmentRecord> {
    const row: AssignmentRecord = {
      id: args.assignmentId,
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      assigneeMemberId: args.assigneeMemberId,
      assignedBy: args.assignedBy,
      unassignedAt: null,
      createdAt: nowIso()
    };
    const key = `${args.tenantId}:${args.conversationId}`;
    const list = this.assignments.get(key) ?? [];
    list.push(row);
    this.assignments.set(key, list);
    return row;
  }

  async appendNote(args: {
    readonly tenantId: string;
    readonly noteId: UuidV7;
    readonly conversationId: string;
    readonly authorMemberId: string;
    readonly body: string;
  }): Promise<NoteRecord> {
    const row: NoteRecord = {
      id: args.noteId,
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      authorMemberId: args.authorMemberId,
      body: args.body,
      createdAt: nowIso()
    };
    const key = `${args.tenantId}:${args.conversationId}`;
    const list = this.notes.get(key) ?? [];
    list.push(row);
    this.notes.set(key, list);
    return row;
  }

  async getAttachment(args: {
    readonly tenantId: string;
    readonly attachmentId: string;
  }): Promise<AttachmentRecord | null> {
    return this.attachments.get(args.tenantId)?.get(args.attachmentId) ?? null;
  }

  /** Test helper — seed attachment row. */
  seedAttachment(row: AttachmentRecord): void {
    this.tenantMap(this.attachments, row.tenantId).set(row.id, row);
  }

  async saveSseEvent(event: SseEventEnvelope): Promise<void> {
    const list = this.sseEvents.get(event.tenantId) ?? [];
    list.push(event);
    this.sseEvents.set(event.tenantId, list);
  }

  async listSseEvents(tenantId: string): Promise<readonly SseEventEnvelope[]> {
    return this.sseEvents.get(tenantId) ?? [];
  }

  async getIdempotentConversation(
    tenantId: string,
    key: string
  ): Promise<ConversationResource | null> {
    return this.idempotentConversations.get(`${tenantId}:${key}`) ?? null;
  }

  async saveIdempotentConversation(
    tenantId: string,
    key: string,
    resource: ConversationResource
  ): Promise<void> {
    this.idempotentConversations.set(`${tenantId}:${key}`, resource);
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

  async resolveCustomerStub(args: {
    readonly tenantId: string;
    readonly externalSenderId: string;
    readonly provider: string;
  }): Promise<string | null> {
    const key = `${args.tenantId}:${args.provider}:${args.externalSenderId}`;
    const existing = this.customerStub.get(key);
    if (existing) return existing;
    const id = generateUuidV7();
    this.customerStub.set(key, id);
    return id;
  }
}
