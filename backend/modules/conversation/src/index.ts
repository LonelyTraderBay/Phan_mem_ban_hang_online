export const MODULE_NAME = "conversation" as const;

export {
  ConversationError,
  addConversationNoteApi,
  assignConversationApi,
  downloadAttachmentStub,
  escalateConversationApi,
  getConversationApi,
  listConversationMessagesApi,
  listConversationsApi,
  openRealtimeStreamStub,
  releaseConversationTakeoverApi,
  reopenConversationApi,
  requireConversationPermission,
  resolveConversationApi,
  sendConversationMessageApi,
  takeOverConversationApi,
  toNormalizedInboundMessage,
  unassignConversationApi,
  updateConversationMetadataApi,
  upsertInboundNormalizedEvent,
  type ConversationErrorCode,
  type ConversationPermission,
  type ConversationRecord,
  type ConversationRepository,
  type ConversationResource,
  type MessageRecord,
  type MessageResource,
  type OutboundQueuePort
} from "./application/conversation.js";

export {
  applyEscalate,
  applyHumanTakeover,
  applyReleaseTakeover,
  applyReopen,
  applyResolve,
  toApiStatus
} from "./domain/state.js";
export { computeSlaDueAt, isSlaBreached, markSlaBreachIfDue } from "./domain/sla.js";
export { computeLeadScoreV1, detectPurchaseIntent, LEAD_SCORE_RULE_VERSION } from "./domain/lead-score.js";
export {
  advanceMalwareScanStub,
  canDownloadAttachment,
  issueAttachmentDownloadTokenStub
} from "./domain/attachment.js";
export {
  authorizeSseStreamStub,
  fanOutConversationEventStub,
  replayEventsSinceStub
} from "./domain/sse.js";

export { InMemoryConversationRepository } from "./infrastructure/persistence/in-memory-conversation.js";
export { createConversationController } from "./presentation/http/conversation.controller.js";
