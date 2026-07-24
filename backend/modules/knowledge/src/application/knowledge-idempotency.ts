import {
  runModuleIdempotent,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { KnowledgeError } from "./knowledge.js";

export const KNOWLEDGE_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const KNOWLEDGE_IDEMPOTENCY_HASH = "1";

export async function runKnowledgeIdempotent<TResult>(options: {
  readonly idempotency: IdempotencyStore | undefined;
  readonly tenantId: string;
  readonly actorId: string;
  readonly scope: string;
  readonly key: string;
  readonly loadCached: () => Promise<TResult | null>;
  readonly rememberCached: (result: TResult) => Promise<void>;
  readonly execute: () => Promise<TResult>;
  readonly resourceId?: (result: TResult) => string | undefined;
  readonly loadByResourceId?: (resourceId: string) => Promise<TResult | null>;
}): Promise<TResult> {
  return runModuleIdempotent({
    ...options,
    requestHash: KNOWLEDGE_IDEMPOTENCY_HASH,
    ttlSeconds: KNOWLEDGE_IDEMPOTENCY_TTL_SECONDS,
    correlationId: "knowledge-idempotency",
    mapInProgress: () =>
      new KnowledgeError("Idempotency key is still processing.", "VALIDATION_FAILED"),
    mapKeyReused: () =>
      new KnowledgeError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      ),
    mapMissingReplay: () =>
      new KnowledgeError("Idempotent replay missing result.", "RESOURCE_NOT_FOUND"),
    isDomainError: (error) => error instanceof KnowledgeError
  });
}
