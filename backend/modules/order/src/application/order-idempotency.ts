import {
  runResourceIdempotent,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { OrderError, type OrderRecord } from "./order.js";

export const ORDER_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/** Stable hash — key uniqueness within scope (matches prior Map semantics). */
export const ORDER_IDEMPOTENCY_HASH = "1";

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
  return runResourceIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: options.scope,
    key: options.key,
    requestHash: ORDER_IDEMPOTENCY_HASH,
    ttlSeconds: ORDER_IDEMPOTENCY_TTL_SECONDS,
    correlationId: "order-idempotency",
    loadCached: options.loadCached,
    rememberCached: options.rememberCached,
    loadById: options.loadById,
    toResult: options.toResult,
    execute: async () => {
      const { order, result } = await options.execute();
      return { resource: order, result };
    },
    mapInProgress: () =>
      new OrderError("Idempotency key is still processing.", "VALIDATION_FAILED"),
    mapKeyReused: () =>
      new OrderError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      ),
    mapMissingReplay: () =>
      new OrderError("Idempotent replay missing order.", "RESOURCE_NOT_FOUND"),
    isDomainError: (error) => error instanceof OrderError
  });
}
