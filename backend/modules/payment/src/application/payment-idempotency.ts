import {
  runResourceIdempotent,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { PaymentError, type PaymentRecord } from "./payment.js";

export const PAYMENT_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const PAYMENT_IDEMPOTENCY_HASH = "1";

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
  return runResourceIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: options.scope,
    key: options.key,
    requestHash: PAYMENT_IDEMPOTENCY_HASH,
    ttlSeconds: PAYMENT_IDEMPOTENCY_TTL_SECONDS,
    correlationId: "payment-idempotency",
    loadCached: options.loadCached,
    rememberCached: options.rememberCached,
    loadById: options.loadById,
    toResult: options.toResult,
    execute: async () => {
      const { payment, result } = await options.execute();
      return { resource: payment, result };
    },
    mapInProgress: () =>
      new PaymentError("Idempotency key is still processing.", "VALIDATION_FAILED"),
    mapKeyReused: () =>
      new PaymentError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      ),
    mapMissingReplay: () =>
      new PaymentError("Idempotent replay missing payment.", "RESOURCE_NOT_FOUND"),
    isDomainError: (error) => error instanceof PaymentError
  });
}
