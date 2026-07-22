/**
 * BE-CHN-006 — Normalize provider message/comment/identity events.
 */

import type { ChannelProvider, NormalizedChannelEvent } from "./adapter.js";

function readString(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeProviderEvent(
  provider: ChannelProvider,
  payload: Record<string, unknown>
): NormalizedChannelEvent | null {
  const objectType = readString(payload, "object") ?? readString(payload, "type");
  const entry = Array.isArray(payload.entry) ? payload.entry[0] : null;
  const messaging = entry && typeof entry === "object"
    ? (entry as Record<string, unknown>).messaging
    : null;
  const messagingItem = Array.isArray(messaging) && messaging[0] && typeof messaging[0] === "object"
    ? (messaging[0] as Record<string, unknown>)
    : null;
  const nestedMessage =
    messagingItem?.message && typeof messagingItem.message === "object"
      ? (messagingItem.message as Record<string, unknown>)
      : null;
  const messageObj = nestedMessage ?? messagingItem ?? payload.message;
  const message = messageObj && typeof messageObj === "object" ? (messageObj as Record<string, unknown>) : null;

  if (message) {
    const sender =
      messagingItem?.sender && typeof messagingItem.sender === "object"
        ? (messagingItem.sender as Record<string, unknown>)
        : message.sender && typeof message.sender === "object"
          ? (message.sender as Record<string, unknown>)
          : {};
    const text = message.text && typeof message.text === "object"
      ? readString(message.text as Record<string, unknown>, "body")
      : readString(message, "text");
    return {
      kind: "message",
      provider,
      externalMessageId: readString(message, "mid") ?? readString(message, "id") ?? digestFallback(payload),
      externalThreadId:
        readString(message, "thread_id") ??
        readString(messagingItem ?? {}, "thread_id") ??
        readString(sender, "id") ??
        "unknown",
      externalSenderId: readString(sender, "id") ?? "unknown",
      direction: "inbound",
      contentType: text ? "text" : "unknown",
      text,
      receivedAt: new Date().toISOString()
    };
  }

  if (objectType === "comment" || payload.comment) {
    const comment = payload.comment && typeof payload.comment === "object"
      ? (payload.comment as Record<string, unknown>)
      : payload;
    return {
      kind: "comment",
      provider,
      externalCommentId: readString(comment, "id") ?? digestFallback(payload),
      externalPostId: readString(comment, "post_id") ?? "unknown",
      externalAuthorId: readString(comment, "from_id") ?? "unknown",
      text: readString(comment, "message"),
      receivedAt: new Date().toISOString()
    };
  }

  if (objectType === "identity" || payload.user_profile) {
    const profile = payload.user_profile && typeof payload.user_profile === "object"
      ? (payload.user_profile as Record<string, unknown>)
      : payload;
    return {
      kind: "identity",
      provider,
      externalUserId: readString(profile, "id") ?? digestFallback(payload),
      displayName: readString(profile, "name"),
      profileUrl: readString(profile, "profile_pic"),
      receivedAt: new Date().toISOString()
    };
  }

  return null;
}

function digestFallback(payload: Record<string, unknown>): string {
  return `unknown-${JSON.stringify(payload).slice(0, 32)}`;
}
