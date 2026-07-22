import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  PaymentError,
  type PaymentRecord,
  type PaymentRepository
} from "../../application/payment.js";
import type { ProviderCallbackPayload } from "../../domain/provider-callback.js";

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly payments = new Map<string, Map<string, PaymentRecord>>();
  private readonly byOrder = new Map<string, PaymentRecord[]>();
  private readonly idempotent = new Map<string, PaymentRecord>();
  private readonly providerEvents = new Map<string, PaymentRecord>();

  private tenantMap(tenantId: string): Map<string, PaymentRecord> {
    let map = this.payments.get(tenantId);
    if (!map) {
      map = new Map();
      this.payments.set(tenantId, map);
    }
    return map;
  }

  async listPaymentsByOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
  }): Promise<readonly PaymentRecord[]> {
    return [...(this.byOrder.get(`${args.tenantId}:${args.orderId}`) ?? [])];
  }

  async getPayment(args: {
    readonly tenantId: string;
    readonly paymentId: string;
  }): Promise<PaymentRecord | null> {
    return this.tenantMap(args.tenantId).get(args.paymentId) ?? null;
  }

  private indexOrder(payment: PaymentRecord): void {
    const key = `${payment.tenantId}:${payment.orderId}`;
    const list = this.byOrder.get(key) ?? [];
    if (!list.some((p) => p.id === payment.id)) {
      list.push(payment);
      this.byOrder.set(key, list);
    }
  }

  async recordPayment(args: {
    readonly tenantId: string;
    readonly paymentId: UuidV7;
    readonly orderId: string;
    readonly actorId: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly method: string;
    readonly providerRef: string | null;
    readonly idempotencyKey: string;
  }): Promise<PaymentRecord> {
    const now = new Date().toISOString();
    const payment: PaymentRecord = {
      id: args.paymentId,
      tenantId: args.tenantId,
      orderId: args.orderId,
      status: "pending",
      amountMinor: args.amountMinor,
      currency: args.currency,
      method: args.method,
      provider: args.method === "transfer" ? "manual" : null,
      providerRef: args.providerRef,
      version: 1,
      createdAt: now,
      updatedAt: now,
      refundedMinor: 0
    };
    this.tenantMap(args.tenantId).set(args.paymentId, payment);
    this.indexOrder(payment);
    return payment;
  }

  async confirmPayment(args: {
    readonly tenantId: string;
    readonly paymentId: string;
    readonly actorId: string;
    readonly expectedVersion: number;
    readonly providerRef: string | null;
  }): Promise<PaymentRecord> {
    const payment = this.tenantMap(args.tenantId).get(args.paymentId);
    if (!payment) {
      throw new PaymentError("Payment not found.", "RESOURCE_NOT_FOUND");
    }
    if (payment.version !== args.expectedVersion) {
      throw new PaymentError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
    }
    if (payment.status !== "pending" && payment.status !== "authorized") {
      throw new PaymentError("Invalid payment state.", "PAYMENT_STATE_INVALID");
    }
    const updated: PaymentRecord = {
      ...payment,
      status: "captured",
      providerRef: args.providerRef ?? payment.providerRef,
      version: payment.version + 1,
      updatedAt: new Date().toISOString()
    };
    this.tenantMap(args.tenantId).set(args.paymentId, updated);
    return updated;
  }

  async createRefund(args: {
    readonly tenantId: string;
    readonly refundId: UuidV7;
    readonly paymentId: string;
    readonly actorId: string;
    readonly amountMinor: number;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<PaymentRecord> {
    const payment = this.tenantMap(args.tenantId).get(args.paymentId);
    if (!payment) {
      throw new PaymentError("Payment not found.", "RESOURCE_NOT_FOUND");
    }
    if (payment.status !== "captured" && payment.status !== "partially_refunded") {
      throw new PaymentError("Invalid payment state.", "PAYMENT_STATE_INVALID");
    }
    const newRefunded = payment.refundedMinor + args.amountMinor;
    if (newRefunded > payment.amountMinor) {
      throw new PaymentError("Refund exceeds payment amount.", "PAYMENT_AMOUNT_MISMATCH");
    }
    const updated: PaymentRecord = {
      ...payment,
      status: newRefunded === payment.amountMinor ? "refunded" : "partially_refunded",
      refundedMinor: newRefunded,
      version: payment.version + 1,
      updatedAt: new Date().toISOString()
    };
    this.tenantMap(args.tenantId).set(args.paymentId, updated);
    return updated;
  }

  async applyProviderCallback(args: {
    readonly tenantId: string;
    readonly paymentId: string;
    readonly payload: ProviderCallbackPayload;
    readonly idempotencyKey: string;
  }): Promise<PaymentRecord> {
    const payment = this.tenantMap(args.tenantId).get(args.paymentId);
    if (!payment) {
      throw new PaymentError("Payment not found.", "RESOURCE_NOT_FOUND");
    }
    if (payment.amountMinor !== args.payload.amountMinor) {
      throw new PaymentError("Amount mismatch.", "PAYMENT_AMOUNT_MISMATCH");
    }
    if (payment.currency !== args.payload.currency) {
      throw new PaymentError("Currency mismatch.", "PAYMENT_AMOUNT_MISMATCH");
    }
    const updated: PaymentRecord = {
      ...payment,
      status: args.payload.status === "captured" ? "captured" : "failed",
      provider: args.payload.provider,
      version: payment.version + 1,
      updatedAt: new Date().toISOString()
    };
    this.tenantMap(args.tenantId).set(args.paymentId, updated);
    return updated;
  }

  async getIdempotentPayment(tenantId: string, key: string): Promise<PaymentRecord | null> {
    return this.idempotent.get(`${tenantId}:${key}`) ?? null;
  }

  async rememberIdempotentPayment(
    tenantId: string,
    key: string,
    payment: PaymentRecord
  ): Promise<void> {
    this.idempotent.set(`${tenantId}:${key}`, payment);
  }

  async getProviderEvent(tenantId: string, providerEventId: string): Promise<PaymentRecord | null> {
    return this.providerEvents.get(`${tenantId}:${providerEventId}`) ?? null;
  }

  async rememberProviderEvent(
    tenantId: string,
    providerEventId: string,
    payment: PaymentRecord
  ): Promise<void> {
    this.providerEvents.set(`${tenantId}:${providerEventId}`, payment);
  }
}
