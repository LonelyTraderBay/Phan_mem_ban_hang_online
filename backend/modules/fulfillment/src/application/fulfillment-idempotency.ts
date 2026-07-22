import type { RequestSecurityContext } from "@ai-sales/auth-context";
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { FulfillmentError } from "./fulfillment.js";

export const FULFILLMENT_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const FULFILLMENT_IDEMPOTENCY_HASH = "1";

export function fulfillmentIdempotencyContext(
  tenantId: string,
  actorId: string
): RequestSecurityContext {
  return {
    actorType: "user",
    actorId: parseUuidV7(actorId),
    tenantId: parseUuidV7(tenantId),
    permissions: [],
    tenantTimezone: "UTC",
    correlationId: "fulfillment-idempotency"
  };
}

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
  if (!options.idempotency) {
    const cached = await options.loadCached();
    if (cached) return options.toResult(cached);
    const { resource, result } = await options.execute();
    await options.rememberCached(resource);
    return result;
  }

  const ctx = fulfillmentIdempotencyContext(options.tenantId, options.actorId);
  const idemReq = {
    scope: options.scope,
    key: options.key,
    requestHash: FULFILLMENT_IDEMPOTENCY_HASH,
    ttlSeconds: FULFILLMENT_IDEMPOTENCY_TTL_SECONDS
  };

  let acquired = false;
  try {
    const reserve = await options.idempotency.reserve(ctx, idemReq);
    if (reserve.outcome === "replay") {
      if (reserve.record.resourceId) {
        const resource = await options.loadById(reserve.record.resourceId);
        if (resource) return options.toResult(resource);
      }
      if (reserve.record.responseBody && typeof reserve.record.responseBody === "object") {
        return reserve.record.responseBody as TResult;
      }
      throw new FulfillmentError("Idempotent replay missing resource.", "RESOURCE_NOT_FOUND");
    }
    acquired = true;
    const { resource, result } = await options.execute();
    await options.idempotency.complete(ctx, idemReq, {
      resourceId: resource.id,
      responseStatus: 200,
      responseBody: result
    });
    return result;
  } catch (error) {
    if (error instanceof IdempotencyInProgressError) {
      throw new FulfillmentError("Idempotency key is still processing.", "VALIDATION_FAILED");
    }
    if (error instanceof IdempotencyKeyReusedError) {
      throw new FulfillmentError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      );
    }
    if (acquired) {
      const retryable = !(error instanceof FulfillmentError);
      await options.idempotency.fail(ctx, idemReq, { retryable }).catch(() => undefined);
    }
    throw error;
  }
}
