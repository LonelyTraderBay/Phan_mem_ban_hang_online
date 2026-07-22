/**
 * BE-CHN-001 — Provider adapter interfaces + normalized inbound event schemas.
 */

export type ChannelProvider = "facebook" | "zalo" | "shopee" | "tiktok" | string;

export type NormalizedEventKind = "message" | "comment" | "identity" | "delivery" | "unknown";

/** Normalized inbound message (blueprint §11.7). */
export interface NormalizedInboundMessage {
  readonly kind: "message";
  readonly provider: ChannelProvider;
  readonly externalMessageId: string;
  readonly externalThreadId: string;
  readonly externalSenderId: string;
  readonly direction: "inbound";
  readonly contentType: "text" | "image" | "file" | "sticker" | "unknown";
  readonly text: string | null;
  readonly receivedAt: string;
}

export interface NormalizedInboundComment {
  readonly kind: "comment";
  readonly provider: ChannelProvider;
  readonly externalCommentId: string;
  readonly externalPostId: string;
  readonly externalAuthorId: string;
  readonly text: string | null;
  readonly receivedAt: string;
}

export interface NormalizedIdentityEvent {
  readonly kind: "identity";
  readonly provider: ChannelProvider;
  readonly externalUserId: string;
  readonly displayName: string | null;
  readonly profileUrl: string | null;
  readonly receivedAt: string;
}

export type NormalizedChannelEvent =
  | NormalizedInboundMessage
  | NormalizedInboundComment
  | NormalizedIdentityEvent;

export interface ProviderWebhookContext {
  readonly provider: ChannelProvider;
  readonly rawBody: Buffer;
  readonly signatureHeader: string | null;
  readonly headers: Readonly<Record<string, string>>;
}

export interface ProviderSendRequest {
  readonly channelAccountId: string;
  readonly externalThreadId: string;
  readonly contentType: string;
  readonly text: string;
  readonly idempotencyKey: string;
}

export interface ProviderSendResult {
  readonly accepted: boolean;
  readonly providerMessageId: string | null;
  readonly responseClass: "success" | "transient" | "permanent" | "rate_limited";
  readonly latencyMs: number;
  readonly error: string | null;
}

/** Provider adapter port — real SDK implementations land in infrastructure later. */
export interface ChannelProviderAdapter {
  readonly provider: ChannelProvider;
  verifyWebhookSignature(ctx: ProviderWebhookContext, secretRef: string): boolean;
  parseWebhookPayload(rawBody: Buffer): Record<string, unknown>;
  normalizeEvent(
    provider: ChannelProvider,
    payload: Record<string, unknown>
  ): NormalizedChannelEvent | null;
  sendMessage(req: ProviderSendRequest, secretRef: string): Promise<ProviderSendResult>;
}
