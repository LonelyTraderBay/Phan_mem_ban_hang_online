import {
  runModuleIdempotent,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { AiOrchestrationError } from "./ai-orchestration.js";

export const AI_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const AI_IDEMPOTENCY_HASH = "1";

export async function runAiIdempotent<TResult>(options: {
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
    requestHash: AI_IDEMPOTENCY_HASH,
    ttlSeconds: AI_IDEMPOTENCY_TTL_SECONDS,
    correlationId: "ai-idempotency",
    mapInProgress: () =>
      new AiOrchestrationError("Idempotency key is still processing.", "VALIDATION_FAILED"),
    mapKeyReused: () =>
      new AiOrchestrationError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      ),
    mapMissingReplay: () =>
      new AiOrchestrationError("Idempotent replay missing result.", "RESOURCE_NOT_FOUND"),
    isDomainError: (error) => error instanceof AiOrchestrationError
  });
}
