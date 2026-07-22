import type { RequestSecurityContext } from "@ai-sales/auth-context";
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { OrderError, type OrderRecord } from "./order.js";

export const ORDER_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/** Stable hash — key uniqueness within scope (matches prior Map semantics). */
export const ORDER_IDEMPOTENCY_HASH = "1";

export function orderIdempotencyContext(
  tenantId: string,
  actorId: string
): RequestSecurityContext {
  return {
    actorType: "user",
    actorId: parseUuidV7(actorId),
    tenantId: parseUuidV7(tenantId),
    permissions: [],
    tenantTimezone: "UTC",
    correlationId: "order-idempotency"
  };
}

export async function runOrderIdempotent<TResult>(options: {
  readonly idempotency: IdempotencyStore | undefined;
  readonly tenantId: string;
  readonly actorId: string;
  readonly scope: string;
  readonly key: string;
  readonly loadCached: () => Promise<OrderRecord | null>;
  readonly rememberCached: (order: OrderRecord) => Promise<void>;
  readonly loadById: (orderId: string) => Promise<OrderRecord | null>;
  readonly toResult: (order: OrderRecord) => TResult;
  readonly execute: () => Promise<{ readonly order: OrderRecord; readonly result: TResult }>;
}): Promise<TResult> {
  if (!options.idempotency) {
    const cached = await options.loadCached();
    if (cached) return options.toResult(cached);
    const { order, result } = await options.execute();
    await options.rememberCached(order);
    return result;
  }

  const ctx = orderIdempotencyContext(options.tenantId, options.actorId);
  const idemReq = {
    scope: options.scope,
    key: options.key,
    requestHash: ORDER_IDEMPOTENCY_HASH,
    ttlSeconds: ORDER_IDEMPOTENCY_TTL_SECONDS
  };

  let acquired = false;
  try {
    const reserve = await options.idempotency.reserve(ctx, idemReq);
    if (reserve.outcome === "replay") {
      if (reserve.record.resourceId) {
        const order = await options.loadById(reserve.record.resourceId);
        if (order) return options.toResult(order);
      }
      if (reserve.record.responseBody && typeof reserve.record.responseBody === "object") {
        return reserve.record.responseBody as TResult;
      }
      throw new OrderError("Idempotent replay missing order.", "RESOURCE_NOT_FOUND");
    }
    acquired = true;
    const { order, result } = await options.execute();
    await options.idempotency.complete(ctx, idemReq, {
      resourceId: order.id,
      responseStatus: 200,
      responseBody: result
    });
    return result;
  } catch (error) {
    if (error instanceof IdempotencyInProgressError) {
      throw new OrderError("Idempotency key is still processing.", "VALIDATION_FAILED");
    }
    if (error instanceof IdempotencyKeyReusedError) {
      throw new OrderError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      );
    }
    if (acquired) {
      const retryable = !(error instanceof OrderError);
      await options.idempotency.fail(ctx, idemReq, { retryable }).catch(() => undefined);
    }
    throw error;
  }
}
