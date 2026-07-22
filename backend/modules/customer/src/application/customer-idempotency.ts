import type { RequestSecurityContext } from "@ai-sales/auth-context";
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { CustomerError, type CustomerResource } from "./customers.js";

export const CUSTOMER_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const CUSTOMER_IDEMPOTENCY_HASH = "1";

export function customerIdempotencyContext(
  tenantId: string,
  actorId: string
): RequestSecurityContext {
  return {
    actorType: "user",
    actorId: parseUuidV7(actorId),
    tenantId: parseUuidV7(tenantId),
    permissions: [],
    tenantTimezone: "UTC",
    correlationId: "customer-idempotency"
  };
}

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
  if (!options.idempotency) {
    const cached = await options.loadCached();
    if (cached) return options.toResult(cached);
    const { customer, result } = await options.execute();
    await options.rememberCached(customer);
    return result;
  }

  const ctx = customerIdempotencyContext(options.tenantId, options.actorId);
  const idemReq = {
    scope: options.scope,
    key: options.key,
    requestHash: CUSTOMER_IDEMPOTENCY_HASH,
    ttlSeconds: CUSTOMER_IDEMPOTENCY_TTL_SECONDS
  };

  let acquired = false;
  try {
    const reserve = await options.idempotency.reserve(ctx, idemReq);
    if (reserve.outcome === "replay") {
      if (reserve.record.resourceId) {
        const customer = await options.loadById(reserve.record.resourceId);
        if (customer) return options.toResult(customer);
      }
      if (reserve.record.responseBody && typeof reserve.record.responseBody === "object") {
        return reserve.record.responseBody as TResult;
      }
      throw new CustomerError("Idempotent replay missing customer.", "RESOURCE_NOT_FOUND");
    }
    acquired = true;
    const { customer, result } = await options.execute();
    await options.idempotency.complete(ctx, idemReq, {
      resourceId: customer.id,
      responseStatus: 200,
      responseBody: result
    });
    return result;
  } catch (error) {
    if (error instanceof IdempotencyInProgressError) {
      throw new CustomerError("Idempotency key is still processing.", "VALIDATION_FAILED");
    }
    if (error instanceof IdempotencyKeyReusedError) {
      throw new CustomerError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      );
    }
    if (acquired) {
      const retryable = !(error instanceof CustomerError);
      await options.idempotency.fail(ctx, idemReq, { retryable }).catch(() => undefined);
    }
    throw error;
  }
}
