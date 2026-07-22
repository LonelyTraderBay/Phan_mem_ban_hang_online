export const MODULE_NAME = "knowledge" as const;

export {
  approveKnowledgeVersion,
  archiveKnowledgeVersion,
  computeContentChecksum,
  createKnowledgeSource,
  createKnowledgeVersion,
  extractContentStub,
  generateChunksFromText,
  generateEmbeddingStub,
  getKnowledgeIngestion,
  getKnowledgeSource,
  KnowledgeError,
  listKnowledgeSources,
  parseIfMatchVersion,
  publishKnowledgeVersion,
  rebuildKnowledgeIndex,
  retryKnowledgeIngestion,
  runChunkAndEmbedGeneration,
  runIngestionPipeline,
  searchPublishedKnowledge,
  submitKnowledgeReview,
  testKnowledgeSearch,
  updateKnowledgeVersion,
  requireKnowledgePermission,
  type IngestionStatus,
  type JobResponseStatus,
  type KnowledgeChunkRecord,
  type KnowledgeErrorCode,
  type KnowledgePermission,
  type KnowledgeRepository,
  type KnowledgeResource,
  type KnowledgeSourceRecord,
  type KnowledgeSourceType,
  type KnowledgeStatus,
  type KnowledgeVersionRecord,
  type PublishedSearchHit
} from "./application/knowledge.js";

export { InMemoryKnowledgeRepository } from "./infrastructure/persistence/in-memory-knowledge.js";
export { createKnowledgeController } from "./presentation/http/knowledge.controller.js";
