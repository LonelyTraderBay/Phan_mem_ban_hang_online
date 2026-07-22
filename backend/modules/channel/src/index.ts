export const MODULE_NAME = "channel" as const;

export {
  ChannelError,
  connectChannel,
  disconnectChannel,
  extractExternalEventId,
  getChannelAccount,
  getOutboundMessageApi,
  getWebhookEventApi,
  handleOAuthCallback,
  listChannelAccounts,
  listWebhookEventsApi,
  processWebhookEvent,
  queueOutboundMessage,
  receiveWebhook,
  recordCircuitFailure,
  refreshAccountHealthSnapshot,
  refreshChannelHealth,
  reprocessWebhookEvent,
  requireChannelPermission,
  retryOutboundMessageApi,
  sendOutboundMessage,
  verifyWebhookSignatureStub,
  type ChannelAccountRecord,
  type ChannelAccountResource,
  type ChannelCredentialRecord,
  type ChannelErrorCode,
  type ChannelPermission,
  type ChannelRepository,
  type JobResponseStatus,
  type OutboundMessageRecord,
  type OutboundStatus,
  type WebhookEventRecord,
  type WebhookEventResource
} from "./application/channel.js";

export type {
  ChannelProvider,
  ChannelProviderAdapter,
  NormalizedChannelEvent,
  NormalizedInboundMessage
} from "./domain/adapter.js";
export { normalizeProviderEvent } from "./domain/normalize.js";
export { computeAccountHealth, deriveAccountStatus } from "./domain/health.js";
export { assertOutboundTransition, canRetryOutbound } from "./domain/outbound.js";
export { scheduleRetryAt, shouldMoveToDlq } from "./domain/queue.js";
export { consumeRateLimitToken, circuitAllowsRequest } from "./domain/rate-limit.js";
export { digestRawBody, redactWebhookPayload } from "./domain/webhook.js";
export {
  generatePkcePair,
  generateOAuthStateToken,
  tenantIdFromOAuthStateToken
} from "./domain/oauth.js";

export { stubFacebookAdapter, StubFacebookAdapter } from "./infrastructure/adapters/stub-facebook-adapter.js";
export { InMemoryChannelRepository } from "./infrastructure/persistence/in-memory-channel.js";
export { PostgresChannelRepository } from "./infrastructure/persistence/postgres-channel.js";
export { createChannelController } from "./presentation/http/channel.controller.js";
