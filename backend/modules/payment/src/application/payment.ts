import type { IdempotencyStore } from "@ai-sales/idempotency";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  normalizeProviderCallbackStub,
  type ProviderCallbackPayload
} from "../domain/provider-callback.js";
import { runPaymentIdempotent } from "./payment-idempotency.js";

/**
 * BE-PAY-001…003 — Payment application layer (manual record/confirm/refund + provider callback stub).
 */

export type PaymentPermission = "payment.read" | "payment.record" | "payment.refund";

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "partially_refunded";

export type PaymentErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_VERSION_MISMATCH"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_STATE_INVALID";

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly code: PaymentErrorCode
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export interface PaymentResource {
  readonly id: string;
  readonly tenant_id: string;
  readonly order_id: string;
  readonly status: PaymentStatus;
  readonly amount_minor: number;
  readonly currency: string;
  readonly provider: string | null;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PaymentAttemptRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly paymentId: string;
  readonly attemptNo: number;
  readonly status: "pending" | "succeeded" | "failed";
  readonly providerEventId: string | null;
}

export interface RefundRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly paymentId: string;
  readonly amountMinor: number;
  readonly reason: string;
  readonly status: "pending" | "completed" | "failed";
}

export interface PaymentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly orderId: string;
  readonly status: PaymentStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly method: string;
  readonly provider: string | null;
  readonly providerRef: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly refundedMinor: number;
}

export interface OrderLookupPort {
  getOrderGrandTotal(args: {
    readonly tenantId: string;
    readonly orderId: string;
  }): Promise<{ readonly grandTotalMinor: number; readonly currency: string } | null>;
}

export interface PaymentRepository {
  listPaymentsByOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
  }): Promise<readonly PaymentRecord[]>;
  getPayment(args: {
    readonly tenantId: string;
    readonly paymentId: string;
  }): Promise<PaymentRecord | null>;

  recordPayment(args: {
    readonly tenantId: string;
    readonly paymentId: UuidV7;
    readonly orderId: string;
    readonly actorId: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly method: string;
    readonly providerRef: string | null;
    readonly idempotencyKey: string;
  }): Promise<PaymentRecord>;

  confirmPayment(args: {
    readonly tenantId: string;
    readonly paymentId: string;
    readonly actorId: string;
    readonly expectedVersion: number;
    readonly providerRef: string | null;
  }): Promise<PaymentRecord>;

  createRefund(args: {
    readonly tenantId: string;
    readonly refundId: UuidV7;
    readonly paymentId: string;
    readonly actorId: string;
    readonly amountMinor: number;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<PaymentRecord>;

  applyProviderCallback(args: {
    readonly tenantId: string;
    readonly paymentId: string;
    readonly payload: ProviderCallbackPayload;
    readonly idempotencyKey: string;
  }): Promise<PaymentRecord>;

  getIdempotentPayment(tenantId: string, key: string): Promise<PaymentRecord | null>;
  rememberIdempotentPayment(tenantId: string, key: string, payment: PaymentRecord): Promise<void>;
  getProviderEvent(tenantId: string, providerEventId: string): Promise<PaymentRecord | null>;
  rememberProviderEvent(tenantId: string, providerEventId: string, payment: PaymentRecord): Promise<void>;
}

export function requirePaymentPermission(
  actorPermissions: readonly string[],
  permission: PaymentPermission
): void {
  if (!actorPermissions.includes(permission)) {
    throw new PaymentError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

function toPaymentResponse(payment: PaymentRecord): Record<string, unknown> {
  return {
    id: payment.id,
    tenant_id: payment.tenantId,
    order_id: payment.orderId,
    status: payment.status,
    amount_minor: payment.amountMinor,
    currency: payment.currency,
    provider: payment.provider,
    version: payment.version,
    created_at: payment.createdAt,
    updated_at: payment.updatedAt
  };
}

function emptyPage() {
  return { next_cursor: null as null, has_more: false as const };
}

export async function listOrderPayments(options: {
  readonly repo: PaymentRepository;
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorPermissions: readonly string[];
}) {
  requirePaymentPermission(options.actorPermissions, "payment.read");
  const rows = await options.repo.listPaymentsByOrder({
    tenantId: options.tenantId,
    orderId: options.orderId
  });
  return {
    data: rows.map(toPaymentResponse),
    page_info: emptyPage(),
    meta: {}
  };
}

export async function recordPayment(options: {
  readonly repo: PaymentRepository;
  readonly orders: OrderLookupPort;
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
  readonly amountMinor: number;
  readonly currency: string;
  readonly method: string;
  readonly providerRef?: string | null;
}) {
  requirePaymentPermission(options.actorPermissions, "payment.record");
  if (!options.idempotencyKey?.trim()) {
    throw new PaymentError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  return runPaymentIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "payment.record",
    key,
    loadCached: () => options.repo.getIdempotentPayment(options.tenantId, key),
    rememberCached: (payment) =>
      options.repo.rememberIdempotentPayment(options.tenantId, key, payment),
    loadById: (paymentId) => options.repo.getPayment({ tenantId: options.tenantId, paymentId }),
    toResult: (payment) => ({ data: toPaymentResponse(payment), meta: {} }),
    execute: async () => {
      if (!Number.isInteger(options.amountMinor) || options.amountMinor <= 0) {
        throw new PaymentError("amount_minor invalid.", "VALIDATION_FAILED");
      }
      const order = await options.orders.getOrderGrandTotal({
        tenantId: options.tenantId,
        orderId: options.orderId
      });
      if (!order) {
        throw new PaymentError("Order not found.", "RESOURCE_NOT_FOUND");
      }
      if (order.currency !== options.currency.trim().toUpperCase()) {
        throw new PaymentError("Currency mismatch.", "VALIDATION_FAILED");
      }
      const payment = await options.repo.recordPayment({
        tenantId: options.tenantId,
        paymentId: generateUuidV7(),
        orderId: options.orderId,
        actorId: options.actorId,
        amountMinor: options.amountMinor,
        currency: options.currency.trim().toUpperCase(),
        method: options.method,
        providerRef: options.providerRef ?? null,
        idempotencyKey: key
      });
      return { payment, result: { data: toPaymentResponse(payment), meta: {} } };
    }
  });
}

export async function confirmPayment(options: {
  readonly repo: PaymentRepository;
  readonly tenantId: string;
  readonly paymentId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
  readonly expectedVersion: number;
  readonly providerRef?: string | null;
}) {
  requirePaymentPermission(options.actorPermissions, "payment.record");
  if (!options.idempotencyKey?.trim()) {
    throw new PaymentError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  return runPaymentIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "payment.confirm",
    key,
    loadCached: () => options.repo.getIdempotentPayment(options.tenantId, key),
    rememberCached: (payment) =>
      options.repo.rememberIdempotentPayment(options.tenantId, key, payment),
    loadById: (paymentId) => options.repo.getPayment({ tenantId: options.tenantId, paymentId }),
    toResult: (payment) => ({ data: toPaymentResponse(payment), meta: {} }),
    execute: async () => {
      const payment = await options.repo.confirmPayment({
        tenantId: options.tenantId,
        paymentId: options.paymentId,
        actorId: options.actorId,
        expectedVersion: options.expectedVersion,
        providerRef: options.providerRef ?? null
      });
      return { payment, result: { data: toPaymentResponse(payment), meta: {} } };
    }
  });
}

export async function createRefund(options: {
  readonly repo: PaymentRepository;
  readonly tenantId: string;
  readonly paymentId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
  readonly amountMinor: number;
  readonly reason: string;
}) {
  requirePaymentPermission(options.actorPermissions, "payment.refund");
  if (!options.idempotencyKey?.trim()) {
    throw new PaymentError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  return runPaymentIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "payment.refund",
    key,
    loadCached: () => options.repo.getIdempotentPayment(options.tenantId, key),
    rememberCached: (payment) =>
      options.repo.rememberIdempotentPayment(options.tenantId, key, payment),
    loadById: (paymentId) => options.repo.getPayment({ tenantId: options.tenantId, paymentId }),
    toResult: (payment) => ({ data: toPaymentResponse(payment), meta: {} }),
    execute: async () => {
      const reason = options.reason?.trim();
      if (!reason) {
        throw new PaymentError("reason is required.", "VALIDATION_FAILED");
      }
      const payment = await options.repo.createRefund({
        tenantId: options.tenantId,
        refundId: generateUuidV7(),
        paymentId: options.paymentId,
        actorId: options.actorId,
        amountMinor: options.amountMinor,
        reason,
        idempotencyKey: key
      });
      return { payment, result: { data: toPaymentResponse(payment), meta: {} } };
    }
  });
}

/** BE-PAY-003 — process provider callback via stub adapter (idempotent by provider_event_id). */
export async function processProviderCallbackStub(options: {
  readonly repo: PaymentRepository;
  readonly provider: string;
  readonly rawBody: string;
  readonly body: Record<string, unknown>;
  readonly idempotencyKey: string;
}) {
  const payload = normalizeProviderCallbackStub(options.provider, options.body);
  if (!payload) {
    throw new PaymentError("Invalid provider callback payload.", "VALIDATION_FAILED");
  }
  const existing = await options.repo.getProviderEvent(
    payload.tenantId,
    payload.providerEventId
  );
  if (existing) {
    return { data: toPaymentResponse(existing), meta: { replay: true } };
  }
  const payment = await options.repo.applyProviderCallback({
    tenantId: payload.tenantId,
    paymentId: payload.paymentId,
    payload,
    idempotencyKey: options.idempotencyKey
  });
  await options.repo.rememberProviderEvent(
    payload.tenantId,
    payload.providerEventId,
    payment
  );
  return { data: toPaymentResponse(payment), meta: {} };
}

export {
  normalizeProviderCallbackStub,
  verifyProviderCallbackSignatureStub
} from "../domain/provider-callback.js";
