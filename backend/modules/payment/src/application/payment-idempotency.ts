import type { RequestSecurityContext } from "@ai-sales/auth-context";
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { PaymentError, type PaymentRecord } from "./payment.js";

export const PAYMENT_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const PAYMENT_IDEMPOTENCY_HASH = "1";

export function paymentIdempotencyContext(
  tenantId: string,
  actorId: string
): RequestSecurityContext {
  return {
    actorType: "user",
    actorId: parseUuidV7(actorId),
    tenantId: parseUuidV7(tenantId),
    permissions: [],
    tenantTimezone: "UTC",
    correlationId: "payment-idempotency"
  };
}

export async function runPaymentIdempotent<TResult>(options: {
  readonly idempotency: IdempotencyStore | undefined;
  readonly tenantId: string;
  readonly actorId: string;
  readonly scope: string;
  readonly key: string;
  readonly loadCached: () => Promise<PaymentRecord | null>;
  readonly rememberCached: (payment: PaymentRecord) => Promise<void>;
  readonly loadById: (paymentId: string) => Promise<PaymentRecord | null>;
  readonly toResult: (payment: PaymentRecord) => TResult;
  readonly execute: () => Promise<{ readonly payment: PaymentRecord; readonly result: TResult }>;
}): Promise<TResult> {
  if (!options.idempotency) {
    const cached = await options.loadCached();
    if (cached) return options.toResult(cached);
    const { payment, result } = await options.execute();
    await options.rememberCached(payment);
    return result;
  }

  const ctx = paymentIdempotencyContext(options.tenantId, options.actorId);
  const idemReq = {
    scope: options.scope,
    key: options.key,
    requestHash: PAYMENT_IDEMPOTENCY_HASH,
    ttlSeconds: PAYMENT_IDEMPOTENCY_TTL_SECONDS
  };

  let acquired = false;
  try {
    const reserve = await options.idempotency.reserve(ctx, idemReq);
    if (reserve.outcome === "replay") {
      if (reserve.record.resourceId) {
        const payment = await options.loadById(reserve.record.resourceId);
        if (payment) return options.toResult(payment);
      }
      if (reserve.record.responseBody && typeof reserve.record.responseBody === "object") {
        return reserve.record.responseBody as TResult;
      }
      throw new PaymentError("Idempotent replay missing payment.", "RESOURCE_NOT_FOUND");
    }
    acquired = true;
    const { payment, result } = await options.execute();
    await options.idempotency.complete(ctx, idemReq, {
      resourceId: payment.id,
      responseStatus: 200,
      responseBody: result
    });
    return result;
  } catch (error) {
    if (error instanceof IdempotencyInProgressError) {
      throw new PaymentError("Idempotency key is still processing.", "VALIDATION_FAILED");
    }
    if (error instanceof IdempotencyKeyReusedError) {
      throw new PaymentError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      );
    }
    if (acquired) {
      const retryable = !(error instanceof PaymentError);
      await options.idempotency.fail(ctx, idemReq, { retryable }).catch(() => undefined);
    }
    throw error;
  }
}
