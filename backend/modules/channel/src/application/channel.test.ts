import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseUuidV7, generateUuidV7 } from "@ai-sales/domain-kernel";
import { hashCodeVerifier } from "../domain/oauth.js";
import { normalizeProviderEvent } from "../domain/normalize.js";
import { verifyWebhookSignatureStub } from "../domain/webhook.js";
import { stubFacebookAdapter } from "../infrastructure/adapters/stub-facebook-adapter.js";
import {
  connectChannel,
  disconnectChannel,
  getChannelAccount,
  handleOAuthCallback,
  listChannelAccounts,
  processWebhookEvent,
  queueOutboundMessage,
  receiveWebhook,
  refreshChannelHealth,
  requireChannelPermission,
  sendOutboundMessage,
  ChannelError
} from "./channel.js";
import { InMemoryChannelRepository } from "../infrastructure/persistence/in-memory-channel.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d1b");
const tenantB = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d2b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d3b");

const readPerms = ["channel.read"];
const connectPerms = ["channel.connect"];
const managePerms = ["channel.read", "channel.manage"];
const sendPerms = ["channel.read", "channel.send"];

function seed() {
  return new InMemoryChannelRepository();
}

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
          message: { mid: "m_fixture_001", text: "Xin chào shop" }
        }
      ]
    }
  ]
};

describe("BE-CHN-001 adapter + normalized schemas", () => {
  it("normalizes facebook message fixture", () => {
    const event = normalizeProviderEvent("facebook", facebookMessageFixture);
    expect(event?.kind).toBe("message");
    expect(event && event.kind === "message" ? event.externalMessageId : null).toBe("m_fixture_001");
  });
});

describe("BE-CHN-004 webhook signature stub", () => {
  it("rejects invalid signature and accepts valid HMAC stub", () => {
    const body = Buffer.from(JSON.stringify(facebookMessageFixture));
    const secret = "test-secret";
    const sig = createHash("sha256").update(secret).update(body).digest("hex");
    expect(verifyWebhookSignatureStub({ rawBody: body, signatureHeader: null, secret })).toBe(false);
    expect(verifyWebhookSignatureStub({ rawBody: body, signatureHeader: `sha256=${sig}`, secret })).toBe(
      true
    );
  });
});

describe("BE-CHN-002/003 accounts + OAuth stubs", () => {
  it("connects channel with OAuth meta and completes callback", async () => {
    const repo = seed();
    const connected = await connectChannel({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: connectPerms,
      idempotencyKey: "connect-1",
      provider: "facebook",
      displayName: "Fanpage A"
    });
    expect(connected.meta.oauth_url).toContain("facebook");
    expect(connected.data.status).toBe("connecting");

    const verifier = "pkce-verifier-stub-1234567890";
    repo.rememberOAuthVerifier(connected.meta.state, verifier);
    await repo.saveOAuthState({
      tenantId: tenantA,
      stateId: generateUuidV7(),
      provider: "facebook",
      stateToken: connected.meta.state,
      codeVerifierHash: hashCodeVerifier(verifier),
      redirectReturnPath: "/settings/channels",
      channelAccountId: connected.data.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    const callback = await handleOAuthCallback({
      repo,
      tenantId: tenantA,
      provider: "facebook",
      state: connected.meta.state,
      code: "auth-code-stub",
      codeVerifier: verifier
    });
    expect(callback.data.status).toBe("active");
    expect(callback.data.health).toBe("ok");
  });
});

describe("BE-CHN-005/006 webhook dedupe + normalize", () => {
  it("fast ACK + dedupe duplicate provider events", async () => {
    const repo = seed();
    const body = Buffer.from(JSON.stringify(facebookMessageFixture));
    const secret = "test-secret";
    const sig = createHash("sha256").update(secret).update(body).digest("hex");
    const first = await receiveWebhook({
      repo,
      adapter: stubFacebookAdapter,
      provider: "facebook",
      rawBody: body,
      signatureHeader: `sha256=${sig}`,
      secretRef: secret,
      tenantId: tenantA,
      channelAccountId: null
    });
    expect(first.meta.ack).toBe("fast");
    expect(first.meta.duplicate).toBe(false);

    const second = await receiveWebhook({
      repo,
      adapter: stubFacebookAdapter,
      provider: "facebook",
      rawBody: body,
      signatureHeader: `sha256=${sig}`,
      secretRef: secret,
      tenantId: tenantA,
      channelAccountId: null
    });
    expect(second.meta.duplicate).toBe(true);

    const processed = await processWebhookEvent({
      repo,
      adapter: stubFacebookAdapter,
      tenantId: tenantA,
      eventId: first.data.id
    });
    expect(processed?.status).toBe("normalized");
  });

  it("dedupes null-tenant webhook replay by provider external event id", async () => {
    const repo = seed();
    const body = Buffer.from(JSON.stringify(facebookMessageFixture));
    const secret = "test-secret";
    const sig = createHash("sha256").update(secret).update(body).digest("hex");
    const first = await receiveWebhook({
      repo,
      adapter: stubFacebookAdapter,
      provider: "facebook",
      rawBody: body,
      signatureHeader: `sha256=${sig}`,
      secretRef: secret,
      tenantId: null,
      channelAccountId: null
    });
    expect(first.meta.duplicate).toBe(false);
    expect(first.data.tenant_id).toBeNull();

    const second = await receiveWebhook({
      repo,
      adapter: stubFacebookAdapter,
      provider: "facebook",
      rawBody: body,
      signatureHeader: `sha256=${sig}`,
      secretRef: secret,
      tenantId: null,
      channelAccountId: null
    });
    expect(second.meta.duplicate).toBe(true);
    expect(second.data.id).toBe(first.data.id);
  });
});

describe("BE-CHN-008 outbound send state machine", () => {
  it("queues and sends outbound message through provider stub", async () => {
    const repo = seed();
    const connected = await connectChannel({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: connectPerms,
      idempotencyKey: "connect-out",
      provider: "facebook"
    });
    const verifier = "pkce-verifier-outbound";
    repo.rememberOAuthVerifier(connected.meta.state, verifier);
    await repo.saveOAuthState({
      tenantId: tenantA,
      stateId: generateUuidV7(),
      provider: "facebook",
      stateToken: connected.meta.state,
      codeVerifierHash: hashCodeVerifier(verifier),
      redirectReturnPath: null,
      channelAccountId: connected.data.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    const active = await handleOAuthCallback({
      repo,
      tenantId: tenantA,
      provider: "facebook",
      state: connected.meta.state,
      code: "code",
      codeVerifier: verifier
    });

    const queued = await queueOutboundMessage({
      repo,
      tenantId: tenantA,
      actorId,
      channelAccountId: active.data.id,
      idempotencyKey: "msg-1",
      contentType: "text",
      text: "Chào bạn"
    });
    expect(queued.status).toBe("queued");

    const sent = await sendOutboundMessage({
      repo,
      adapter: stubFacebookAdapter,
      tenantId: tenantA,
      actorId,
      messageId: queued.id,
      secretRef: "secret",
      externalThreadId: "user-42"
    });
    expect(sent.status).toBe("sent");
    expect(sent.providerMessageId).toBeTruthy();
  });
});

describe("permission + tenant isolation", () => {
  it("denies missing channel.read", () => {
    expect(() => requireChannelPermission([], "channel.read")).toThrow(ChannelError);
  });

  it("isolates accounts per tenant", async () => {
    const repo = seed();
    await connectChannel({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: connectPerms,
      idempotencyKey: "a-connect",
      provider: "facebook"
    });
    const listB = await listChannelAccounts({
      repo,
      tenantId: tenantB,
      actorPermissions: readPerms
    });
    expect(listB.data).toHaveLength(0);
  });

  it("disconnect requires channel.manage", async () => {
    const repo = seed();
    const connected = await connectChannel({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: connectPerms,
      idempotencyKey: "disc",
      provider: "facebook"
    });
    await expect(
      disconnectChannel({
        repo,
        tenantId: tenantA,
        actorId,
        actorPermissions: readPerms,
        idempotencyKey: "disc-1",
        accountId: connected.data.id
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });

  it("refresh health requires manage permission", async () => {
    const repo = seed();
    const connected = await connectChannel({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: connectPerms,
      idempotencyKey: "health",
      provider: "facebook"
    });
    await expect(
      refreshChannelHealth({
        repo,
        tenantId: tenantA,
        actorId,
        actorPermissions: sendPerms,
        idempotencyKey: "h-1",
        accountId: connected.data.id
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });

  it("get account is tenant scoped", async () => {
    const repo = seed();
    const connected = await connectChannel({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: connectPerms,
      idempotencyKey: "get",
      provider: "facebook"
    });
    await expect(
      getChannelAccount({
        repo,
        tenantId: tenantB,
        actorPermissions: readPerms,
        accountId: connected.data.id
      })
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});
