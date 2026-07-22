export const MODULE_NAME = "ai-orchestration" as const;

export {
  activatePromptVersion,
  approveAISuggestion,
  approvePromptVersion,
  AiOrchestrationError,
  createAISuggestion,
  createPromptVersion,
  disableAI,
  enableAI,
  evaluateAIResponse,
  getAILog,
  getAIQualityReport,
  getEvaluationRun,
  invokeAiToolStub,
  listAIBlockedOutputs,
  listAILogs,
  listConversationAISuggestions,
  listPromptVersions,
  requireAiPermission,
  rollbackPromptVersion,
  runPromptEvaluation,
  sendAISuggestion,
  testAIMessage,
  type AiErrorCode,
  type AiPermission,
  type ConversationLookupPort,
  type OutboundSendPort
} from "./application/ai-orchestration.js";

export { buildAiContext } from "./domain/context-builder.js";
export { deterministicClassifierFallback } from "./domain/classifier.js";
export { evaluateToolPolicy, TOOL_REGISTRY } from "./domain/tool-registry.js";
export { enforceAiRules } from "./domain/ai-rules.js";
export { StubModelGateway, DEFAULT_GATEWAY_CONFIG } from "./infrastructure/gateway/model-gateway.js";
export {
  createKnowledgeRetrievalClient,
  InMemoryKnowledgeRetrievalStub
} from "./infrastructure/clients/knowledge-retrieval.js";
export {
  InMemoryAiOrchestrationRepository,
  type AiOrchestrationRepository
} from "./infrastructure/persistence/in-memory-ai-orchestration.js";
export { PostgresAiOrchestrationRepository } from "./infrastructure/persistence/postgres-ai-orchestration.js";
export { createAiOrchestrationController } from "./presentation/http/ai-orchestration.controller.js";
