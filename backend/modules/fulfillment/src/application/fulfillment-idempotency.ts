import {
  runResourceIdempotent,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { FulfillmentError } from "./fulfillment.js";

export const FULFILLMENT_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const FULFILLMENT_IDEMPOTENCY_HASH = "1";

export async function runFulfillmentIdempotent<
  TResource extends { readonly id: string },
  TResult
>(options: {
  readonly idempotency: IdempotencyStore | undefined;
  readonly tenantId: string;
  readonly actorId: string;
  readonly scope: string;
  readonly key: string;
  readonly loadCached: () => Promise<TResource | null>;
  readonly rememberCached: (resource: TResource) => Promise<void>;
  readonly loadById: (resourceId: string) => Promise<TResource | null>;
  readonly toResult: (resource: TResource) => TResult;
  readonly execute: () => Promise<{ readonly resource: TResource; readonly result: TResult }>;
}): Promise<TResult> {
  return runResourceIdempotent({
    ...options,
    requestHash: FULFILLMENT_IDEMPOTENCY_HASH,
    ttlSeconds: FULFILLMENT_IDEMPOTENCY_TTL_SECONDS,
    correlationId: "fulfillment-idempotency",
    mapInProgress: () =>
      new FulfillmentError("Idempotency key is still processing.", "VALIDATION_FAILED"),
    mapKeyReused: () =>
      new FulfillmentError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      ),
    mapMissingReplay: () =>
      new FulfillmentError("Idempotent replay missing resource.", "RESOURCE_NOT_FOUND"),
    isDomainError: (error) => error instanceof FulfillmentError
  });
}
