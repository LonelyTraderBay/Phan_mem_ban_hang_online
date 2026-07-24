import {
  runModuleIdempotent,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { CatalogError } from "./catalog.js";

export const CATALOG_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const CATALOG_IDEMPOTENCY_HASH = "1";

export async function runCatalogIdempotent<TResult>(options: {
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
    requestHash: CATALOG_IDEMPOTENCY_HASH,
    ttlSeconds: CATALOG_IDEMPOTENCY_TTL_SECONDS,
    correlationId: "catalog-idempotency",
    mapInProgress: () =>
      new CatalogError("Idempotency key is still processing.", "VALIDATION_FAILED"),
    mapKeyReused: () =>
      new CatalogError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      ),
    mapMissingReplay: () =>
      new CatalogError("Idempotent replay missing result.", "RESOURCE_NOT_FOUND"),
    isDomainError: (error) => error instanceof CatalogError
  });
}
