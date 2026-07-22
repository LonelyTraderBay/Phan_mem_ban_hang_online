import { describe, expect, it } from "vitest";
import { parseUuidV7, generateUuidV7 } from "@ai-sales/domain-kernel";
import { computeLeadScoreV1, detectPurchaseIntent } from "../domain/lead-score.js";
import { computeSlaDueAt, isSlaBreached } from "../domain/sla.js";
import {
  applyEscalate,
  applyHumanTakeover,
  applyResolve,
  canResolve,
  toApiStatus
} from "../domain/state.js";
import {
  authorizeSseStreamStub,
  fanOutConversationEventStub,
  replayEventsSinceStub
} from "../domain/sse.js";
import {
  advanceMalwareScanStub,
  canDownloadAttachment,
  issueAttachmentDownloadTokenStub
} from "../domain/attachment.js";
import {
  addConversationNoteApi,
  assignConversationApi,
  ConversationError,
  downloadAttachmentStub,
  getConversationApi,
  listConversationMessagesApi,
  listConversationsApi,
  openRealtimeStreamStub,
  requireConversationPermission,
  resolveConversationApi,
  sendConversationMessageApi,
  takeOverConversationApi,
  toNormalizedInboundMessage,
  upsertInboundNormalizedEvent,
  type OutboundQueuePort
} from "./conversation.js";
import { InMemoryConversationRepository } from "../infrastructure/persistence/in-memory-conversation.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d1b");
const tenantB = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d2b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d3b");
const assigneeId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d4b");
const channelAccountId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d5b");

const readPerms = ["conversation.read"];
const replyPerms = ["conversation.read", "conversation.reply"];
const assignPerms = ["conversation.read", "conversation.assign"];
const takeoverPerms = ["conversation.read", "conversation.takeover"];

const outboundStub: OutboundQueuePort = {
  async queueReply(args) {
    return { outboundMessageId: generateUuidV7(), status: "queued" };
  }
};

function seed() {
  return new InMemoryConversationRepository();
}

describe("BE-CON-001/004 state dimensions", () => {
  it("projects API status from independent dimensions", () => {
    expect(
      toApiStatus({
        lifecycleStatus: "open",
        waitingOn: "customer",
        salesStage: "none",
        escalationStatus: "normal",
        aiMode: "copilot"
      })
    ).toBe("pending");
    expect(
      toApiStatus({
        lifecycleStatus: "archived",
        waitingOn: "none",
        salesStage: "none",
        escalationStatus: "normal",
        aiMode: "off"
      })
    ).toBe("closed");
  });

  it("enforces resolve and escalate transitions", () => {
    const open = {
      lifecycleStatus: "open" as const,
      waitingOn: "staff" as const,
      salesStage: "none" as const,
      escalationStatus: "normal" as const,
      aiMode: "copilot" as const
    };
    expect(canResolve(open)).toBe(true);
    const resolved = applyResolve(open);
    expect(resolved.lifecycleStatus).toBe("resolved");
    const escalated = applyEscalate(open);
    expect(escalated.escalationStatus).toBe("escalated");
    const takeover = applyHumanTakeover(open);
    expect(takeover.aiMode).toBe("human_takeover");
  });
});

describe("BE-CON-002 inbound upsert", () => {
  it("creates conversation + message and dedupes external message id", async () => {
    const repo = seed();
    const event = toNormalizedInboundMessage({
      provider: "facebook",
      externalMessageId: "mid-001",
      externalThreadId: "thread-1",
      externalSenderId: "user-1",
      contentType: "text",
      text: "Giá bao nhiêu?",
      receivedAt: new Date().toISOString()
    });
    const first = await upsertInboundNormalizedEvent({
      repo,
      tenantId: tenantA,
      channelAccountId,
      event,
      actorId
    });
    expect(first.duplicate).toBe(false);
    expect(first.conversation.lifecycleStatus).toBe("open");
    expect(first.conversation.leadScore).toBeGreaterThan(0);

    const second = await upsertInboundNormalizedEvent({
      repo,
      tenantId: tenantA,
      channelAccountId,
      event,
      actorId
    });
    expect(second.duplicate).toBe(true);
  });
});

describe("BE-CON-003 list/detail/messages + tenant isolation", () => {
  it("lists conversations with cursor and denies cross-tenant read", async () => {
    const repo = seed();
    await upsertInboundNormalizedEvent({
      repo,
      tenantId: tenantA,
      channelAccountId,
      event: toNormalizedInboundMessage({
        provider: "facebook",
        externalMessageId: "mid-a",
        externalThreadId: "t-a",
        externalSenderId: "u-a",
        contentType: "text",
        text: "Hello",
        receivedAt: new Date().toISOString()
      }),
      actorId
    });
    const list = await listConversationsApi({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms
    });
    expect(list.data.length).toBe(1);

    await expect(
      getConversationApi({
        repo,
        tenantId: tenantB,
        actorPermissions: readPerms,
        conversationId: list.data[0]!.id
      })
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("lists messages for a conversation", async () => {
    const repo = seed();
    const upsert = await upsertInboundNormalizedEvent({
      repo,
      tenantId: tenantA,
      channelAccountId,
      event: toNormalizedInboundMessage({
        provider: "facebook",
        externalMessageId: "mid-b",
        externalThreadId: "t-b",
        externalSenderId: "u-b",
        contentType: "text",
        text: "Hi shop",
        receivedAt: new Date().toISOString()
      }),
      actorId
    });
    const messages = await listConversationMessagesApi({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms,
      conversationId: upsert.conversation.id
    });
    expect(messages.data.length).toBe(1);
    expect(messages.meta.conversation_id).toBe(upsert.conversation.id);
  });
});

describe("BE-CON-005 assignment and notes", () => {
  it("assigns conversation and appends internal note", async () => {
    const repo = seed();
    const upsert = await upsertInboundNormalizedEvent({
      repo,
      tenantId: tenantA,
      channelAccountId,
      event: toNormalizedInboundMessage({
        provider: "facebook",
        externalMessageId: "mid-c",
        externalThreadId: "t-c",
        externalSenderId: "u-c",
        contentType: "text",
        text: "Need help",
        receivedAt: new Date().toISOString()
      }),
      actorId
    });
    const assigned = await assignConversationApi({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: assignPerms,
      idempotencyKey: "assign-1",
      conversationId: upsert.conversation.id,
      assigneeMemberId: assigneeId,
      expectedVersion: upsert.conversation.version
    });
    expect(assigned.data.assignee_member_id).toBe(assigneeId);

    const noted = await addConversationNoteApi({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: replyPerms,
      idempotencyKey: "note-1",
      conversationId: upsert.conversation.id,
      body: "Khách hỏi giá"
    });
    expect(noted.meta.note_id).toBeTruthy();
  });
});

describe("BE-CON-006 reply queues outbound", () => {
  it("sends reply and records outbound message", async () => {
    const repo = seed();
    const upsert = await upsertInboundNormalizedEvent({
      repo,
      tenantId: tenantA,
      channelAccountId,
      event: toNormalizedInboundMessage({
        provider: "facebook",
        externalMessageId: "mid-d",
        externalThreadId: "t-d",
        externalSenderId: "u-d",
        contentType: "text",
        text: "Mua hàng",
        receivedAt: new Date().toISOString()
      }),
      actorId
    });
    const job = await sendConversationMessageApi({
      repo,
      outbound: outboundStub,
      tenantId: tenantA,
      actorId,
      actorPermissions: replyPerms,
      idempotencyKey: "reply-1",
      conversationId: upsert.conversation.id,
      expectedVersion: upsert.conversation.version,
      text: "Dạ shop gửi giá ạ"
    });
    expect(job.data.status).toBe("queued");
    const messages = await listConversationMessagesApi({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms,
      conversationId: upsert.conversation.id
    });
    expect(messages.data.some((m) => m.direction === "outbound")).toBe(true);
  });
});

describe("BE-CON-007/008 SLA + lead score stubs", () => {
  it("computes SLA due and lead score v1", () => {
    const due = computeSlaDueAt({
      startedAt: new Date("2026-07-22T08:00:00.000Z"),
      responseMinutes: 30
    });
    expect(due).toBeTruthy();
    expect(
      isSlaBreached({ slaDueAt: "2020-01-01T00:00:00.000Z", slaBreachedAt: null })
    ).toBe(true);
    expect(detectPurchaseIntent("Cho mình giá sản phẩm")).toBe(true);
    const score = computeLeadScoreV1({
      inboundMessageCount: 2,
      hasPurchaseIntentKeywords: true,
      escalationStatus: "normal"
    });
    expect(score.ruleVersion).toBe("lead-score-v1");
    expect(score.score).toBeGreaterThan(50);
  });
});

describe("BE-CON-009 human takeover", () => {
  it("blocks reply when takeover active for another agent", async () => {
    const repo = seed();
    const upsert = await upsertInboundNormalizedEvent({
      repo,
      tenantId: tenantA,
      channelAccountId,
      event: toNormalizedInboundMessage({
        provider: "facebook",
        externalMessageId: "mid-e",
        externalThreadId: "t-e",
        externalSenderId: "u-e",
        contentType: "text",
        text: "Help",
        receivedAt: new Date().toISOString()
      }),
      actorId
    });
    const taken = await takeOverConversationApi({
      repo,
      tenantId: tenantA,
      actorId: assigneeId,
      actorPermissions: takeoverPerms,
      idempotencyKey: "takeover-1",
      conversationId: upsert.conversation.id,
      expectedVersion: upsert.conversation.version
    });
    expect(taken.data.ai_takeover).toBe(true);

    await expect(
      sendConversationMessageApi({
        repo,
        outbound: outboundStub,
        tenantId: tenantA,
        actorId,
        actorPermissions: replyPerms,
        idempotencyKey: "reply-blocked",
        conversationId: upsert.conversation.id,
        expectedVersion: taken.data.version,
        text: "AI reply"
      })
    ).rejects.toMatchObject({ code: "HUMAN_TAKEOVER_ACTIVE" });
  });
});

describe("BE-CON-010 SSE stub", () => {
  it("authorizes stream and replays events", async () => {
    const repo = seed();
    await repo.saveSseEvent({
      id: "evt-1",
      type: "conversation.message.received.v1",
      tenantId: tenantA,
      conversationId: "conv-1",
      payload: {},
      occurredAt: new Date().toISOString()
    });
    const scope = authorizeSseStreamStub({
      tenantId: tenantA,
      memberId: actorId,
      permissions: readPerms
    });
    expect(scope).toBeTruthy();
    const stream = await openRealtimeStreamStub({
      repo,
      tenantId: tenantA,
      memberId: actorId,
      permissions: readPerms,
      lastEventId: null
    });
    expect(stream.authorized).toBe(true);
    expect(stream.events.length).toBe(1);
    const replayed = replayEventsSinceStub(stream.events, "evt-1");
    expect(replayed.length).toBe(0);
    const fanout = fanOutConversationEventStub(scope!, stream.events[0]!);
    expect(fanout.length).toBe(1);
  });
});

describe("BE-CON-011 attachment security stub", () => {
  it("blocks download until malware scan clean", async () => {
    const repo = seed();
    const attachmentId = generateUuidV7();
    repo.seedAttachment({
      id: attachmentId,
      tenantId: tenantA,
      messageId: generateUuidV7(),
      objectKey: "tenant/a/file.pdf",
      malwareScanState: "pending",
      expiresAt: null
    });
    const pending = await downloadAttachmentStub({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms,
      attachmentId
    });
    expect(pending.allowed).toBe(true);
    expect(pending.token).toBeTruthy();
    expect(
      canDownloadAttachment({
        id: attachmentId,
        objectKey: "x",
        malwareScanState: "infected",
        expiresAt: null
      })
    ).toBe(false);
    expect(
      issueAttachmentDownloadTokenStub({
        id: attachmentId,
        objectKey: "x",
        malwareScanState: advanceMalwareScanStub("pending"),
        expiresAt: null
      })
    ).toBeTruthy();
  });
});

describe("permissions", () => {
  it("denies without conversation.read", () => {
    expect(() => requireConversationPermission([], "conversation.read")).toThrow(ConversationError);
  });

  it("denies resolve without conversation.reply", async () => {
    const repo = seed();
    const upsert = await upsertInboundNormalizedEvent({
      repo,
      tenantId: tenantA,
      channelAccountId,
      event: toNormalizedInboundMessage({
        provider: "facebook",
        externalMessageId: "mid-f",
        externalThreadId: "t-f",
        externalSenderId: "u-f",
        contentType: "text",
        text: "Ping",
        receivedAt: new Date().toISOString()
      }),
      actorId
    });
    await expect(
      resolveConversationApi({
        repo,
        tenantId: tenantA,
        actorId,
        actorPermissions: readPerms,
        idempotencyKey: "resolve-deny",
        conversationId: upsert.conversation.id,
        expectedVersion: upsert.conversation.version
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });
});
