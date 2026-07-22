import type {
  ChannelProviderAdapter,
  NormalizedChannelEvent,
  ProviderSendRequest,
  ProviderSendResult,
  ProviderWebhookContext
} from "../../domain/adapter.js";
import { normalizeProviderEvent } from "../../domain/normalize.js";
import { verifyWebhookSignatureStub } from "../../domain/webhook.js";

/**
 * BE-CHN-001/011 — Stub Facebook adapter for fixture/replay tests.
 */
export class StubFacebookAdapter implements ChannelProviderAdapter {
  readonly provider = "facebook";

  verifyWebhookSignature(ctx: ProviderWebhookContext, secretRef: string): boolean {
    return verifyWebhookSignatureStub({
      rawBody: ctx.rawBody,
      signatureHeader: ctx.signatureHeader,
      secret: secretRef
    });
  }

  parseWebhookPayload(rawBody: Buffer): Record<string, unknown> {
    return JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  }

  normalizeEvent(
    provider: string,
    payload: Record<string, unknown>
  ): NormalizedChannelEvent | null {
    return normalizeProviderEvent(provider, payload);
  }

  async sendMessage(req: ProviderSendRequest, _secretRef: string): Promise<ProviderSendResult> {
    return {
      accepted: true,
      providerMessageId: `fb-msg-${req.idempotencyKey.slice(0, 8)}`,
      responseClass: "success",
      latencyMs: 42,
      error: null
    };
  }
}

export const stubFacebookAdapter = new StubFacebookAdapter();
