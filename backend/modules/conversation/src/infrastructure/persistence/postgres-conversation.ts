import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
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
import type { MalwareScanState } from "../../domain/attachment.js";
import type { SseEventEnvelope } from "../../domain/sse.js";
import type {
  AiMode,
  EscalationStatus,
  LifecycleStatus,
  SalesStage,
  WaitingOn
} from "../../domain/state.js";

type Trx = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];

type ConversationRow = {
  id: string;
  tenant_id: string;
  channel_account_id: string | null;
  customer_id: string | null;
  external_thread_id: string;
  lifecycle_status: LifecycleStatus;
  waiting_on: WaitingOn;
  sales_stage: SalesStage;
  escalation_status: EscalationStatus;
  ai_mode: AiMode;
  assignee_member_id: string | null;
  lead_score: number | null;
  lead_score_rule_version: string | null;
  lead_score_provenance: unknown;
  sla_due_at: Date | null;
  sla_breached_at: Date | null;
  last_inbound_at: Date | null;
  last_outbound_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type MessageRow = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  direction: MessageRecord["direction"];
  external_message_id: string | null;
  sender_identity: string | null;
  content_type: string;
  body_redacted: string | null;
  reply_to_message_id: string | null;
  ai_generated: boolean;
  delivery_status: string | null;
  sent_at: Date | null;
  received_at: Date | null;
  created_at: Date;
};

type AttachmentRow = {
  id: string;
  tenant_id: string;
  message_id: string;
  object_key: string;
  malware_scan_state: MalwareScanState;
  expires_at: Date | null;
};

type AssignmentRow = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  assignee_member_id: string;
  assigned_by: string | null;
  unassigned_at: Date | null;
  created_at: Date;
};

type NoteRow = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  author_member_id: string;
  body: string;
  created_at: Date;
};

const CONVERSATION_SELECT = sql`
  id, tenant_id, channel_account_id, customer_id, external_thread_id,
  lifecycle_status, waiting_on, sales_stage, escalation_status, ai_mode,
  assignee_member_id, lead_score, lead_score_rule_version, lead_score_provenance,
  sla_due_at, sla_breached_at, last_inbound_at, last_outbound_at,
  version, created_at, updated_at
`;

const MESSAGE_SELECT = sql`
  id, tenant_id, conversation_id, direction, external_message_id, sender_identity,
  content_type, body_redacted, reply_to_message_id, ai_generated, delivery_status,
  sent_at, received_at, created_at
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

function toConversation(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    channelAccountId: row.channel_account_id,
    customerId: row.customer_id,
    externalThreadId: row.external_thread_id,
    lifecycleStatus: row.lifecycle_status,
    waitingOn: row.waiting_on,
    salesStage: row.sales_stage,
    escalationStatus: row.escalation_status,
    aiMode: row.ai_mode,
    assigneeMemberId: row.assignee_member_id,
    leadScore: row.lead_score == null ? null : Number(row.lead_score),
    leadScoreRuleVersion: row.lead_score_rule_version,
    leadScoreProvenance: parseObject(row.lead_score_provenance),
    slaDueAt: toIso(row.sla_due_at),
    slaBreachedAt: toIso(row.sla_breached_at),
    lastInboundAt: toIso(row.last_inbound_at),
    lastOutboundAt: toIso(row.last_outbound_at),
    version: Number(row.version),
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!
  };
}

function toMessage(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    direction: row.direction,
    externalMessageId: row.external_message_id,
    senderIdentity: row.sender_identity,
    contentType: row.content_type,
    bodyRedacted: row.body_redacted,
    replyToMessageId: row.reply_to_message_id,
    aiGenerated: Boolean(row.ai_generated),
    deliveryStatus: row.delivery_status,
    sentAt: toIso(row.sent_at),
    receivedAt: toIso(row.received_at),
    createdAt: toIso(row.created_at)!
  };
}

function toAttachment(row: AttachmentRow): AttachmentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    messageId: row.message_id,
    objectKey: row.object_key,
    malwareScanState: row.malware_scan_state,
    expiresAt: toIso(row.expires_at)
  };
}

function toAssignment(row: AssignmentRow): AssignmentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    assigneeMemberId: row.assignee_member_id,
    assignedBy: row.assigned_by,
    unassignedAt: toIso(row.unassigned_at),
    createdAt: toIso(row.created_at)!
  };
}

function toNote(row: NoteRow): NoteRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    authorMemberId: row.author_member_id,
    body: row.body,
    createdAt: toIso(row.created_at)!
  };
}

/**
 * HTTP idempotency is via PostgresIdempotencyStore at application layer
 * (get/save below are no-ops kept for ConversationRepository interface / InMemory parity).
 * SSE + customer stub remain process-local Maps (no tables yet).
 */
export class PostgresConversationRepository implements ConversationRepository {
  /** No SSE table yet — process-local fan-out buffer. */
  private readonly sseEvents = new Map<string, SseEventEnvelope[]>();
  /** Optional later: customer_identities table. */
  private readonly customerStub = new Map<string, string>();

  constructor(private readonly db: AppDatabase) {}

  private async loadConversation(
    trx: Trx,
    tenantId: string,
    conversationId: string,
    options?: { readonly forUpdate?: boolean }
  ): Promise<ConversationRecord | null> {
    const result = options?.forUpdate
      ? await sql<ConversationRow>`
          select ${CONVERSATION_SELECT}
          from app.conversations
          where id = ${conversationId}::uuid and tenant_id = ${tenantId}::uuid
          for update
        `.execute(trx)
      : await sql<ConversationRow>`
          select ${CONVERSATION_SELECT}
          from app.conversations
          where id = ${conversationId}::uuid and tenant_id = ${tenantId}::uuid
        `.execute(trx);
    const row = result.rows[0];
    return row ? toConversation(row) : null;
  }

  async findConversationByThread(args: {
    readonly tenantId: string;
    readonly channelAccountId: string;
    readonly externalThreadId: string;
  }): Promise<ConversationRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<ConversationRow>`
        select ${CONVERSATION_SELECT}
        from app.conversations
        where tenant_id = ${args.tenantId}::uuid
          and channel_account_id = ${args.channelAccountId}::uuid
          and external_thread_id = ${args.externalThreadId}
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      return row ? toConversation(row) : null;
    });
  }

  async createConversation(args: {
    readonly tenantId: string;
    readonly conversationId: UuidV7;
    readonly channelAccountId: string;
    readonly externalThreadId: string;
    readonly customerId: string | null;
    readonly actorId: string;
  }): Promise<ConversationRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    try {
      return await withTenantTransaction(this.db, ctx, async (trx) => {
        const result = await sql<ConversationRow>`
          insert into app.conversations (
            id, tenant_id, channel_account_id, customer_id, external_thread_id,
            lifecycle_status, waiting_on, sales_stage, escalation_status, ai_mode,
            lead_score_provenance, version, created_by, updated_by
          ) values (
            ${args.conversationId}::uuid,
            ${args.tenantId}::uuid,
            ${args.channelAccountId}::uuid,
            ${args.customerId}::uuid,
            ${args.externalThreadId},
            'new',
            'none',
            'none',
            'normal',
            'copilot',
            '{}'::jsonb,
            1,
            ${args.actorId}::uuid,
            ${args.actorId}::uuid
          )
          returning ${CONVERSATION_SELECT}
        `.execute(trx);
        return toConversation(result.rows[0]!);
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Concurrent inbound upsert for same thread — return the winner.
      const existing = await this.findConversationByThread({
        tenantId: args.tenantId,
        channelAccountId: args.channelAccountId,
        externalThreadId: args.externalThreadId
      });
      if (!existing) throw error;
      return existing;
    }
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
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadConversation(trx, args.tenantId, args.conversationId, {
        forUpdate: true
      });
      if (!current) {
        throw new ConversationError("Conversation not found.", "RESOURCE_NOT_FOUND");
      }
      if (args.expectedVersion !== null && current.version !== args.expectedVersion) {
        throw new ConversationError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }

      const lifecycleStatus =
        args.patch.lifecycleStatus !== undefined
          ? args.patch.lifecycleStatus
          : current.lifecycleStatus;
      const waitingOn =
        args.patch.waitingOn !== undefined ? args.patch.waitingOn : current.waitingOn;
      const salesStage =
        args.patch.salesStage !== undefined ? args.patch.salesStage : current.salesStage;
      const escalationStatus =
        args.patch.escalationStatus !== undefined
          ? args.patch.escalationStatus
          : current.escalationStatus;
      const aiMode = args.patch.aiMode !== undefined ? args.patch.aiMode : current.aiMode;
      const assigneeMemberId =
        args.patch.assigneeMemberId !== undefined
          ? args.patch.assigneeMemberId
          : current.assigneeMemberId;
      const customerId =
        args.patch.customerId !== undefined ? args.patch.customerId : current.customerId;
      const leadScore =
        args.patch.leadScore !== undefined ? args.patch.leadScore : current.leadScore;
      const leadScoreRuleVersion =
        args.patch.leadScoreRuleVersion !== undefined
          ? args.patch.leadScoreRuleVersion
          : current.leadScoreRuleVersion;
      const leadScoreProvenance =
        args.patch.leadScoreProvenance !== undefined
          ? args.patch.leadScoreProvenance
          : current.leadScoreProvenance;
      const slaDueAt =
        args.patch.slaDueAt !== undefined ? args.patch.slaDueAt : current.slaDueAt;
      const slaBreachedAt =
        args.patch.slaBreachedAt !== undefined ? args.patch.slaBreachedAt : current.slaBreachedAt;
      const lastInboundAt =
        args.patch.lastInboundAt !== undefined ? args.patch.lastInboundAt : current.lastInboundAt;
      const lastOutboundAt =
        args.patch.lastOutboundAt !== undefined
          ? args.patch.lastOutboundAt
          : current.lastOutboundAt;

      const versionClause =
        args.expectedVersion !== null
          ? sql`and version = ${args.expectedVersion}`
          : sql``;

      const updated = await sql<ConversationRow>`
        update app.conversations
        set lifecycle_status = ${lifecycleStatus},
            waiting_on = ${waitingOn},
            sales_stage = ${salesStage},
            escalation_status = ${escalationStatus},
            ai_mode = ${aiMode},
            assignee_member_id = ${assigneeMemberId}::uuid,
            customer_id = ${customerId}::uuid,
            lead_score = ${leadScore},
            lead_score_rule_version = ${leadScoreRuleVersion},
            lead_score_provenance = ${JSON.stringify(leadScoreProvenance)}::jsonb,
            sla_due_at = ${slaDueAt}::timestamptz,
            sla_breached_at = ${slaBreachedAt}::timestamptz,
            last_inbound_at = ${lastInboundAt}::timestamptz,
            last_outbound_at = ${lastOutboundAt}::timestamptz,
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.conversationId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          ${versionClause}
        returning ${CONVERSATION_SELECT}
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new ConversationError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      return toConversation(updated.rows[0]);
    });
  }

  async listConversations(args: {
    readonly tenantId: string;
    readonly cursor: string | null;
    readonly limit: number;
  }): Promise<{ readonly items: readonly ConversationRecord[]; readonly nextCursor: string | null }> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<ConversationRow>`
        select ${CONVERSATION_SELECT}
        from app.conversations
        where tenant_id = ${args.tenantId}::uuid
        order by updated_at desc, id desc
      `.execute(trx);
      const all = result.rows.map(toConversation);
      let start = 0;
      if (args.cursor) {
        const idx = all.findIndex((c) => c.id === args.cursor);
        if (idx < 0) return { items: [], nextCursor: null };
        start = idx + 1;
      }
      const slice = all.slice(start, start + args.limit);
      const nextCursor =
        start + args.limit < all.length ? (slice.at(-1)?.id ?? null) : null;
      return { items: slice, nextCursor };
    });
  }

  async getConversation(args: {
    readonly tenantId: string;
    readonly conversationId: string;
  }): Promise<ConversationRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) =>
      this.loadConversation(trx, args.tenantId, args.conversationId)
    );
  }

  async findMessageByExternal(args: {
    readonly tenantId: string;
    readonly conversationId: string;
    readonly externalMessageId: string;
  }): Promise<MessageRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<MessageRow>`
        select ${MESSAGE_SELECT}
        from app.messages
        where tenant_id = ${args.tenantId}::uuid
          and conversation_id = ${args.conversationId}::uuid
          and external_message_id = ${args.externalMessageId}
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      return row ? toMessage(row) : null;
    });
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
    const ctx = adapterSecurityContext(args.tenantId);
    try {
      return await withTenantTransaction(this.db, ctx, async (trx) => {
        const result = await sql<MessageRow>`
          insert into app.messages (
            id, tenant_id, conversation_id, direction, external_message_id, sender_identity,
            content_type, body_redacted, reply_to_message_id, ai_generated,
            received_at, sent_at
          ) values (
            ${args.messageId}::uuid,
            ${args.tenantId}::uuid,
            ${args.conversationId}::uuid,
            ${args.direction},
            ${args.externalMessageId},
            ${args.senderIdentity},
            ${args.contentType},
            ${args.bodyRedacted},
            ${args.replyToMessageId}::uuid,
            ${args.aiGenerated},
            ${args.receivedAt}::timestamptz,
            ${args.sentAt}::timestamptz
          )
          returning ${MESSAGE_SELECT}
        `.execute(trx);
        return toMessage(result.rows[0]!);
      });
    } catch (error) {
      if (!isUniqueViolation(error) || !args.externalMessageId) throw error;
      const existing = await this.findMessageByExternal({
        tenantId: args.tenantId,
        conversationId: args.conversationId,
        externalMessageId: args.externalMessageId
      });
      if (!existing) throw error;
      return existing;
    }
  }

  async listMessages(args: {
    readonly tenantId: string;
    readonly conversationId: string;
    readonly cursor: string | null;
    readonly limit: number;
  }): Promise<{ readonly items: readonly MessageRecord[]; readonly nextCursor: string | null }> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<MessageRow>`
        select ${MESSAGE_SELECT}
        from app.messages
        where tenant_id = ${args.tenantId}::uuid
          and conversation_id = ${args.conversationId}::uuid
        order by created_at desc, id desc
      `.execute(trx);
      const all = result.rows.map(toMessage);
      let start = 0;
      if (args.cursor) {
        const idx = all.findIndex((m) => m.id === args.cursor);
        if (idx < 0) return { items: [], nextCursor: null };
        start = idx + 1;
      }
      const slice = all.slice(start, start + args.limit);
      const nextCursor =
        start + args.limit < all.length ? (slice.at(-1)?.id ?? null) : null;
      return { items: slice, nextCursor };
    });
  }

  async countInboundMessages(args: {
    readonly tenantId: string;
    readonly conversationId: string;
  }): Promise<number> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{ n: string | number }>`
        select count(*)::int as n
        from app.messages
        where tenant_id = ${args.tenantId}::uuid
          and conversation_id = ${args.conversationId}::uuid
          and direction = 'inbound'
      `.execute(trx);
      return Number(result.rows[0]?.n ?? 0);
    });
  }

  async appendAssignment(args: {
    readonly tenantId: string;
    readonly assignmentId: UuidV7;
    readonly conversationId: string;
    readonly assigneeMemberId: string;
    readonly assignedBy: string;
  }): Promise<AssignmentRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.assignedBy);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<AssignmentRow>`
        insert into app.conversation_assignments (
          id, tenant_id, conversation_id, assignee_member_id, assigned_by
        ) values (
          ${args.assignmentId}::uuid,
          ${args.tenantId}::uuid,
          ${args.conversationId}::uuid,
          ${args.assigneeMemberId}::uuid,
          ${args.assignedBy}::uuid
        )
        returning id, tenant_id, conversation_id, assignee_member_id, assigned_by,
                  unassigned_at, created_at
      `.execute(trx);
      return toAssignment(result.rows[0]!);
    });
  }

  async appendNote(args: {
    readonly tenantId: string;
    readonly noteId: UuidV7;
    readonly conversationId: string;
    readonly authorMemberId: string;
    readonly body: string;
  }): Promise<NoteRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.authorMemberId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<NoteRow>`
        insert into app.conversation_notes (
          id, tenant_id, conversation_id, author_member_id, body
        ) values (
          ${args.noteId}::uuid,
          ${args.tenantId}::uuid,
          ${args.conversationId}::uuid,
          ${args.authorMemberId}::uuid,
          ${args.body}
        )
        returning id, tenant_id, conversation_id, author_member_id, body, created_at
      `.execute(trx);
      return toNote(result.rows[0]!);
    });
  }

  async getAttachment(args: {
    readonly tenantId: string;
    readonly attachmentId: string;
  }): Promise<AttachmentRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<AttachmentRow>`
        select id, tenant_id, message_id, object_key, malware_scan_state, expires_at
        from app.message_attachments
        where id = ${args.attachmentId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      const row = result.rows[0];
      return row ? toAttachment(row) : null;
    });
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
    _tenantId: string,
    _key: string
  ): Promise<ConversationResource | null> {
    return null;
  }

  async saveIdempotentConversation(
    _tenantId: string,
    _key: string,
    _resource: ConversationResource
  ): Promise<void> {
    /* no-op — use IdempotencyStore */
  }

  async getIdempotentJobResponse(
    _tenantId: string,
    _key: string
  ): Promise<{
    readonly job_id: string;
    readonly status: JobResponseStatus;
    readonly status_url: string | null;
  } | null> {
    return null;
  }

  async saveIdempotentJobResponse(
    _tenantId: string,
    _key: string,
    _response: {
      readonly job_id: string;
      readonly status: JobResponseStatus;
      readonly status_url: string | null;
    }
  ): Promise<void> {
    /* no-op — use IdempotencyStore */
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
