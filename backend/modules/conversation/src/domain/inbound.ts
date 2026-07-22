/**
 * BE-CON-002 — Inbound normalized event helpers.
 */

export interface NormalizedInboundMessage {
  readonly kind: "message";
  readonly provider: string;
  readonly externalMessageId: string;
  readonly externalThreadId: string;
  readonly externalSenderId: string;
  readonly direction: "inbound";
  readonly contentType: string;
  readonly text: string | null;
  readonly receivedAt: string;
}

export interface NormalizedIdentityEvent {
  readonly kind: "identity";
  readonly provider: string;
  readonly externalUserId: string;
  readonly displayName: string | null;
  readonly receivedAt: string;
}

export type NormalizedConversationEvent = NormalizedInboundMessage | NormalizedIdentityEvent;

export function conversationThreadKey(channelAccountId: string, externalThreadId: string): string {
  return `${channelAccountId}:${externalThreadId}`;
}

export function messageDedupeKey(
  tenantId: string,
  conversationId: string,
  externalMessageId: string
): string {
  return `${tenantId}:${conversationId}:${externalMessageId}`;
}
