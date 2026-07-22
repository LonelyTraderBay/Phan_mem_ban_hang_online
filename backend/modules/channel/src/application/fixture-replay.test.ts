import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseUuidV7, generateUuidV7 } from "@ai-sales/domain-kernel";
import { hashCodeVerifier } from "../domain/oauth.js";
import { scheduleRetryAt, shouldMoveToDlq } from "../domain/queue.js";
import { consumeRateLimitToken, circuitAllowsRequest, recordCircuitFailure } from "../domain/rate-limit.js";
import { computeAccountHealth } from "../domain/health.js";
import { stubFacebookAdapter } from "../infrastructure/adapters/stub-facebook-adapter.js";
import {
  connectChannel,
  handleOAuthCallback,
  processWebhookEvent,
  queueOutboundMessage,
  receiveWebhook,
  sendOutboundMessage
} from "./channel.js";
import { InMemoryChannelRepository } from "../infrastructure/persistence/in-memory-channel.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d1b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d3b");
const connectPerms = ["channel.connect"];

const fixtures = {
  messageV1: {
    object: "page",
    entry: [{ id: "p1", messaging: [{ sender: { id: "u1" }, message: { mid: "mid-v1", text: "Hi" } }] }]
  },
  messageV1Replay: {
    object: "page",
    entry: [{ id: "p1", messaging: [{ sender: { id: "u1" }, message: { mid: "mid-v1", text: "Hi" } }] }]
  },
  commentV1: {
    object: "comment",
    comment: { id: "c1", post_id: "post-1", from_id: "u9", message: "Nice product" }
  }
} as const;

function sign(body: Buffer, secret: string): string {
  return `sha256=${createHash("sha256").update(secret).update(body).digest("hex")}`;
}

describe("BE-CHN-011 provider fixture/replay suite", () => {
  it("replays facebook message fixture end-to-end without duplicate side effects", async () => {
    const repo = new InMemoryChannelRepository();
    const secret = "fixture-secret";
    const connected = await connectChannel({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: connectPerms,
      idempotencyKey: "fixture-connect",
      provider: "facebook",
      displayName: "Replay Page"
    });
    const verifier = "fixture-pkce-verifier-abcdef";
    await repo.saveOAuthState({
      tenantId: tenantA,
      stateId: generateUuidV7(),
      provider: "facebook",
      stateToken: connected.meta.state,
      codeVerifierHash: hashCodeVerifier(verifier),
      redirectReturnPath: null,
      channelAccountId: connected.data.id,
      expiresAt: new Date(Date.now() + 120_000).toISOString()
    });
    repo.rememberOAuthVerifier(connected.meta.state, verifier);
    const active = await handleOAuthCallback({
      repo,
      tenantId: tenantA,
      provider: "facebook",
      state: connected.meta.state,
      code: "fixture-code",
      codeVerifier: verifier
    });

    const body = Buffer.from(JSON.stringify(fixtures.messageV1));
    const ack1 = await receiveWebhook({
      repo,
      adapter: stubFacebookAdapter,
      provider: "facebook",
      rawBody: body,
      signatureHeader: sign(body, secret),
      secretRef: secret,
      tenantId: tenantA,
      channelAccountId: active.data.id
    });
    const ack2 = await receiveWebhook({
      repo,
      adapter: stubFacebookAdapter,
      provider: "facebook",
      rawBody: Buffer.from(JSON.stringify(fixtures.messageV1Replay)),
      signatureHeader: sign(body, secret),
      secretRef: secret,
      tenantId: tenantA,
      channelAccountId: active.data.id
    });
    expect(ack1.meta.duplicate).toBe(false);
    expect(ack2.meta.duplicate).toBe(true);
    expect(ack1.data.id).toBe(ack2.data.id);

    const normalized = await processWebhookEvent({
      repo,
      adapter: stubFacebookAdapter,
      tenantId: tenantA,
      eventId: ack1.data.id
    });
    expect(normalized?.status).toBe("normalized");

    const outbound = await queueOutboundMessage({
      repo,
      tenantId: tenantA,
      actorId,
      channelAccountId: active.data.id,
      idempotencyKey: "fixture-reply",
      contentType: "text",
      text: "Cảm ơn bạn"
    });
    const sent = await sendOutboundMessage({
      repo,
      adapter: stubFacebookAdapter,
      tenantId: tenantA,
      actorId,
      messageId: outbound.id,
      secretRef: secret,
      externalThreadId: "u1"
    });
    expect(sent.status).toBe("sent");
  });

  it("normalizes comment fixture", async () => {
    const event = stubFacebookAdapter.normalizeEvent("facebook", fixtures.commentV1);
    expect(event?.kind).toBe("comment");
  });
});

describe("BE-CHN-007/009/010 queue + rate limit + health stubs", () => {
  it("computes retry backoff and DLQ threshold", () => {
    expect(shouldMoveToDlq(4)).toBe(false);
    expect(shouldMoveToDlq(5)).toBe(true);
    expect(scheduleRetryAt(1)).toBeTruthy();
  });

  it("blocks when rate bucket empty and circuit open", () => {
    const limited = consumeRateLimitToken({ tokens: 0, capacity: 10, resetAt: new Date().toISOString() });
    expect(limited.allowed).toBe(false);
    const opened = recordCircuitFailure({ failures: 4, state: "closed", openedAt: null });
    const tripped = recordCircuitFailure(opened);
    expect(tripped.state).toBe("open");
    expect(circuitAllowsRequest(tripped)).toBe(false);
  });

  it("flags warn health when token near expiry", () => {
    const soon = new Date(Date.now() + 60_000).toISOString();
    expect(
      computeAccountHealth({
        tokenExpiresAt: soon,
        grantedScopes: ["pages_messaging"],
        requiredScopes: ["pages_messaging"],
        webhookLagSeconds: null,
        sendFailureRatio: null,
        providerOutage: false
      })
    ).toBe("warn");
  });
});
