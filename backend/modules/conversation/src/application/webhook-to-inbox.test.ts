import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseUuidV7, generateUuidV7 } from "@ai-sales/domain-kernel";
import {
  connectChannel,
  handleOAuthCallback,
  processWebhookEvent,
  queueOutboundMessage,
  receiveWebhook,
  sendOutboundMessage,
  stubFacebookAdapter
} from "@ai-sales/module-channel";
import { InMemoryChannelRepository } from "@ai-sales/module-channel";
import {
  listConversationMessagesApi,
  listConversationsApi,
  sendConversationMessageApi,
  toNormalizedInboundMessage,
  upsertInboundNormalizedEvent,
  type OutboundQueuePort
} from "./conversation.js";
import { InMemoryConversationRepository } from "../infrastructure/persistence/in-memory-conversation.js";

function hashCodeVerifier(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("hex");
}

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d1b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d3b");
const connectPerms = ["channel.connect"];
const readPerms = ["conversation.read"];
const replyPerms = ["conversation.read", "conversation.reply"];

const facebookMessageFixture = {
  object: "page",
  entry: [
    {
      id: "page-1",
      messaging: [
        {
          sender: { id: "user-42" },
          recipient: { id: "page-1" },
          timestamp: 1_700_000_000_000,
          message: { mid: "m_e2e_001", text: "Xin chào shop, giá bao nhiêu?" }
        }
      ]
    }
  ]
};

function sign(body: Buffer, secret: string): string {
  return `sha256=${createHash("sha256").update(secret).update(body).digest("hex")}`;
}

describe("BE-CON-012 webhook-to-inbox/reply-to-provider e2e", () => {
  it("flows webhook -> normalized inbox -> agent reply -> outbound queue", async () => {
    const channelRepo = new InMemoryChannelRepository();
    const conversationRepo = new InMemoryConversationRepository();
    const secret = "e2e-secret";

    const connected = await connectChannel({
      repo: channelRepo,
      tenantId: tenantA,
      actorId,
      actorPermissions: connectPerms,
      idempotencyKey: "e2e-connect",
      provider: "facebook",
      displayName: "E2E Page"
    });
    const verifier = "e2e-pkce-verifier-abcdefgh";
    channelRepo.rememberOAuthVerifier(connected.meta.state, verifier);
    await channelRepo.saveOAuthState({
      tenantId: tenantA,
      stateId: generateUuidV7(),
      provider: "facebook",
      stateToken: connected.meta.state,
      codeVerifierHash: hashCodeVerifier(verifier),
      redirectReturnPath: null,
      channelAccountId: connected.data.id,
      expiresAt: new Date(Date.now() + 120_000).toISOString()
    });
    const active = await handleOAuthCallback({
      repo: channelRepo,
      tenantId: tenantA,
      provider: "facebook",
      state: connected.meta.state,
      code: "e2e-code",
      codeVerifier: verifier
    });

    const body = Buffer.from(JSON.stringify(facebookMessageFixture));
    const ack = await receiveWebhook({
      repo: channelRepo,
      adapter: stubFacebookAdapter,
      provider: "facebook",
      rawBody: body,
      signatureHeader: sign(body, secret),
      secretRef: secret,
      tenantId: tenantA,
      channelAccountId: active.data.id
    });
    expect(ack.meta.duplicate).toBe(false);

    const processed = await processWebhookEvent({
      repo: channelRepo,
      adapter: stubFacebookAdapter,
      tenantId: tenantA,
      eventId: ack.data.id
    });
    expect(processed?.status).toBe("normalized");

    const normalized = stubFacebookAdapter.normalizeEvent("facebook", facebookMessageFixture);
    expect(normalized?.kind).toBe("message");
    if (!normalized || normalized.kind !== "message") {
      throw new Error("Expected normalized message");
    }

    const inbound = await upsertInboundNormalizedEvent({
      repo: conversationRepo,
      tenantId: tenantA,
      channelAccountId: active.data.id,
      event: toNormalizedInboundMessage({
        provider: normalized.provider,
        externalMessageId: normalized.externalMessageId,
        externalThreadId: normalized.externalThreadId,
        externalSenderId: normalized.externalSenderId,
        contentType: normalized.contentType,
        text: normalized.text,
        receivedAt: normalized.receivedAt
      }),
      actorId
    });
    expect(inbound.duplicate).toBe(false);
    expect(inbound.conversation.lifecycleStatus).toBe("open");

    const inbox = await listConversationsApi({
      repo: conversationRepo,
      tenantId: tenantA,
      actorPermissions: readPerms
    });
    expect(inbox.data.length).toBe(1);
    expect(inbox.data[0]!.status).toBe("open");

    const messages = await listConversationMessagesApi({
      repo: conversationRepo,
      tenantId: tenantA,
      actorPermissions: readPerms,
      conversationId: inbound.conversation.id
    });
    expect(messages.data[0]!.body).toContain("giá");

    const outboundPort: OutboundQueuePort = {
      async queueReply(args) {
        const queued = await queueOutboundMessage({
          repo: channelRepo,
          tenantId: args.tenantId,
          actorId: args.actorId,
          channelAccountId: args.channelAccountId,
          idempotencyKey: args.idempotencyKey,
          contentType: "text",
          text: args.text
        });
        const sent = await sendOutboundMessage({
          repo: channelRepo,
          adapter: stubFacebookAdapter,
          tenantId: args.tenantId,
          actorId: args.actorId,
          messageId: queued.id,
          secretRef: secret,
          externalThreadId: args.externalThreadId
        });
        return {
          outboundMessageId: sent.id,
          status: sent.status === "sent" ? "completed" : "queued"
        };
      }
    };

    const reply = await sendConversationMessageApi({
      repo: conversationRepo,
      outbound: outboundPort,
      tenantId: tenantA,
      actorId,
      actorPermissions: replyPerms,
      idempotencyKey: "e2e-reply",
      conversationId: inbound.conversation.id,
      expectedVersion: inbound.conversation.version,
      text: "Dạ sản phẩm 100.000đ ạ"
    });
    expect(reply.data.status).toBe("completed");

    const after = await listConversationMessagesApi({
      repo: conversationRepo,
      tenantId: tenantA,
      actorPermissions: readPerms,
      conversationId: inbound.conversation.id
    });
    expect(after.data.some((m) => m.direction === "outbound")).toBe(true);
  });
});
