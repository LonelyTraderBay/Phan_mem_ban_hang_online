import {
  runResourceIdempotent,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { CustomerError, type CustomerResource } from "./customers.js";

export const CUSTOMER_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const CUSTOMER_IDEMPOTENCY_HASH = "1";

export async function runCustomerIdempotent<TResult>(options: {
  readonly idempotency: IdempotencyStore | undefined;
  readonly tenantId: string;
  readonly actorId: string;
  readonly scope: string;
  readonly key: string;
  readonly loadCached: () => Promise<CustomerResource | null>;
  readonly rememberCached: (customer: CustomerResource) => Promise<void>;
  readonly loadById: (customerId: string) => Promise<CustomerResource | null>;
  readonly toResult: (customer: CustomerResource) => TResult;
  readonly execute: () => Promise<{
    readonly customer: CustomerResource;
    readonly result: TResult;
  }>;
}): Promise<TResult> {
  return runResourceIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: options.scope,
    key: options.key,
    requestHash: CUSTOMER_IDEMPOTENCY_HASH,
    ttlSeconds: CUSTOMER_IDEMPOTENCY_TTL_SECONDS,
    correlationId: "customer-idempotency",
    loadCached: options.loadCached,
    rememberCached: options.rememberCached,
    loadById: options.loadById,
    toResult: options.toResult,
    execute: async () => {
      const { customer, result } = await options.execute();
      return { resource: customer, result };
    },
    mapInProgress: () =>
      new CustomerError("Idempotency key is still processing.", "VALIDATION_FAILED"),
    mapKeyReused: () =>
      new CustomerError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      ),
    mapMissingReplay: () =>
      new CustomerError("Idempotent replay missing customer.", "RESOURCE_NOT_FOUND"),
    isDomainError: (error) => error instanceof CustomerError
  });
}
