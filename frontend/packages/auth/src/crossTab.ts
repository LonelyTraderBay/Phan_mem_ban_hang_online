/**
 * Cross-tab/session sync (spec 9.6): logout, session-revoked, tenant-switched, and
 * permission/feature-flag refresh are broadcast across tabs. Never broadcast PII or a token.
 */

export type CrossTabMessage =
  | { type: "logout" }
  | { type: "session_revoked" }
  | { type: "tenant_switched"; tenantId: string }
  | { type: "permission_refresh_required" };

const DEFAULT_CHANNEL_NAME = "ai-sales-auth";

export interface CrossTabChannel {
  postMessage(message: CrossTabMessage): void;
  subscribe(handler: (message: CrossTabMessage) => void): () => void;
  close(): void;
}

export function createCrossTabChannel(channelName: string = DEFAULT_CHANNEL_NAME): CrossTabChannel {
  const channel = new BroadcastChannel(channelName);
  return {
    postMessage(message) {
      channel.postMessage(message);
    },
    subscribe(handler) {
      const listener = (event: MessageEvent<CrossTabMessage>) => handler(event.data);
      channel.addEventListener("message", listener);
      return () => channel.removeEventListener("message", listener);
    },
    close() {
      channel.close();
    },
  };
}
