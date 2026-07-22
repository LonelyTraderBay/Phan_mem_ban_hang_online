import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  PaymentError,
  type PaymentRecord,
  type PaymentRepository,
  type PaymentStatus
} from "../../application/payment.js";
import type { ProviderCallbackPayload } from "../../domain/provider-callback.js";

type PaymentRow = {
  id: string;
  tenant_id: string;
  order_id: string;
  status: PaymentStatus;
  amount_minor: string | number;
  currency: string;
  method: string;
  provider: string | null;
  provider_ref: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type Trx = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];

const ALLOWED_METHODS = new Set(["cod", "transfer", "card", "ewallet", "other"]);

async function sumRefundedMinor(trx: Trx, tenantId: string, paymentId: string): Promise<number> {
  const result = await sql<{ total: string | number | null }>`
    select coalesce(sum(amount_minor), 0) as total
    from app.refunds
    where tenant_id = ${tenantId}::uuid
      and payment_id = ${paymentId}::uuid
      and status in ('pending', 'completed')
  `.execute(trx);
  return Number(result.rows[0]?.total ?? 0);
}

function toPayment(row: PaymentRow, refundedMinor: number): PaymentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderId: row.order_id,
    status: row.status,
    amountMinor: Number(row.amount_minor),
    currency: row.currency.trim(),
    method: row.method,
    provider: row.provider,
    providerRef: row.provider_ref,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    refundedMinor
  };
}

/**
 * Payment Postgres adapter.
 * HTTP idempotency via PostgresIdempotencyStore at application layer.
 * `providerEvents` Map remains for webhook event-id dedupe (not HTTP Idempotency-Key).
 */
export class PostgresPaymentRepository implements PaymentRepository {
  private readonly providerEvents = new Map<string, PaymentRecord>();

  constructor(private readonly db: AppDatabase) {}

  private idemKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  private async loadPayment(
    trx: Trx,
    tenantId: string,
    paymentId: string,
    options?: { readonly forUpdate?: boolean }
  ): Promise<PaymentRecord | null> {
    const result = options?.forUpdate
      ? await sql<PaymentRow>`
          select id, tenant_id, order_id, status, amount_minor, currency, method,
                 provider, provider_ref, version, created_at, updated_at
          from app.payments
          where id = ${paymentId}::uuid and tenant_id = ${tenantId}::uuid
          for update
        `.execute(trx)
      : await sql<PaymentRow>`
          select id, tenant_id, order_id, status, amount_minor, currency, method,
                 provider, provider_ref, version, created_at, updated_at
          from app.payments
          where id = ${paymentId}::uuid and tenant_id = ${tenantId}::uuid
        `.execute(trx);
    const row = result.rows[0];
    if (!row) return null;
    const refundedMinor = await sumRefundedMinor(trx, tenantId, paymentId);
    return toPayment(row, refundedMinor);
  }

  async listPaymentsByOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
  }): Promise<readonly PaymentRecord[]> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<PaymentRow>`
        select id, tenant_id, order_id, status, amount_minor, currency, method,
               provider, provider_ref, version, created_at, updated_at
        from app.payments
        where tenant_id = ${args.tenantId}::uuid and order_id = ${args.orderId}::uuid
        order by created_at asc
      `.execute(trx);
      const out: PaymentRecord[] = [];
      for (const row of result.rows) {
        const refundedMinor = await sumRefundedMinor(trx, args.tenantId, row.id);
        out.push(toPayment(row, refundedMinor));
      }
      return out;
    });
  }

  async getPayment(args: {
    readonly tenantId: string;
    readonly paymentId: string;
  }): Promise<PaymentRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) =>
      this.loadPayment(trx, args.tenantId, args.paymentId)
    );
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
    if (!ALLOWED_METHODS.has(args.method)) {
      throw new PaymentError("Invalid payment method.", "VALIDATION_FAILED");
    }
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const provider = args.method === "transfer" ? "manual" : null;
      const result = await sql<PaymentRow>`
        insert into app.payments (
          id, tenant_id, order_id, status, amount_minor, currency, method,
          provider, provider_ref, version, created_by, updated_by
        ) values (
          ${args.paymentId}::uuid,
          ${args.tenantId}::uuid,
          ${args.orderId}::uuid,
          'pending',
          ${args.amountMinor},
          ${args.currency},
          ${args.method},
          ${provider},
          ${args.providerRef},
          1,
          ${args.actorId}::uuid,
          ${args.actorId}::uuid
        )
        returning id, tenant_id, order_id, status, amount_minor, currency, method,
                  provider, provider_ref, version, created_at, updated_at
      `.execute(trx);
      return toPayment(result.rows[0]!, 0);
    });
  }

  async confirmPayment(args: {
    readonly tenantId: string;
    readonly paymentId: string;
    readonly actorId: string;
    readonly expectedVersion: number;
    readonly providerRef: string | null;
  }): Promise<PaymentRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadPayment(trx, args.tenantId, args.paymentId);
      if (!current) {
        throw new PaymentError("Payment not found.", "RESOURCE_NOT_FOUND");
      }
      if (current.version !== args.expectedVersion) {
        throw new PaymentError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      if (current.status !== "pending" && current.status !== "authorized") {
        throw new PaymentError("Invalid payment state.", "PAYMENT_STATE_INVALID");
      }
      const nextProviderRef = args.providerRef ?? current.providerRef;
      const updated = await sql<PaymentRow>`
        update app.payments
        set status = 'captured',
            provider_ref = ${nextProviderRef},
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.paymentId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and version = ${args.expectedVersion}
        returning id, tenant_id, order_id, status, amount_minor, currency, method,
                  provider, provider_ref, version, created_at, updated_at
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new PaymentError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      return toPayment(updated.rows[0], current.refundedMinor);
    });
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
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const existingRefund = await sql<{ payment_id: string }>`
        select payment_id from app.refunds
        where tenant_id = ${args.tenantId}::uuid and idempotency_key = ${args.idempotencyKey}
        limit 1
      `.execute(trx);
      if (existingRefund.rows[0]) {
        const replay = await this.loadPayment(trx, args.tenantId, existingRefund.rows[0].payment_id);
        if (replay) return replay;
      }

      const current = await this.loadPayment(trx, args.tenantId, args.paymentId, {
        forUpdate: true
      });
      if (!current) {
        throw new PaymentError("Payment not found.", "RESOURCE_NOT_FOUND");
      }
      if (current.status !== "captured" && current.status !== "partially_refunded") {
        throw new PaymentError("Invalid payment state.", "PAYMENT_STATE_INVALID");
      }
      const newRefunded = current.refundedMinor + args.amountMinor;
      if (newRefunded > current.amountMinor) {
        throw new PaymentError("Refund exceeds payment amount.", "PAYMENT_AMOUNT_MISMATCH");
      }
      const nextStatus: PaymentStatus =
        newRefunded === current.amountMinor ? "refunded" : "partially_refunded";

      await sql`
        insert into app.refunds (
          id, tenant_id, payment_id, amount_minor, reason, status, idempotency_key, created_by
        ) values (
          ${args.refundId}::uuid,
          ${args.tenantId}::uuid,
          ${args.paymentId}::uuid,
          ${args.amountMinor},
          ${args.reason},
          'completed',
          ${args.idempotencyKey},
          ${args.actorId}::uuid
        )
      `.execute(trx);

      const updated = await sql<PaymentRow>`
        update app.payments
        set status = ${nextStatus},
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.paymentId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and version = ${current.version}
        returning id, tenant_id, order_id, status, amount_minor, currency, method,
                  provider, provider_ref, version, created_at, updated_at
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new PaymentError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      return toPayment(updated.rows[0], newRefunded);
    });
  }

  private async insertPaymentAttempt(
    trx: Trx,
    args: {
      readonly tenantId: string;
      readonly paymentId: string;
      readonly status: "pending" | "succeeded" | "failed";
      readonly providerEventId: string | null;
      readonly idempotencyKey: string;
    }
  ): Promise<void> {
    const attemptNoResult = await sql<{ n: string | number }>`
      select coalesce(max(attempt_no), 0) + 1 as n
      from app.payment_attempts
      where tenant_id = ${args.tenantId}::uuid and payment_id = ${args.paymentId}::uuid
    `.execute(trx);
    const attemptNo = Number(attemptNoResult.rows[0]?.n ?? 1);
    await sql`
      insert into app.payment_attempts (
        id, tenant_id, payment_id, attempt_no, status, provider_event_id, idempotency_key
      ) values (
        ${generateUuidV7()}::uuid,
        ${args.tenantId}::uuid,
        ${args.paymentId}::uuid,
        ${attemptNo},
        ${args.status},
        ${args.providerEventId},
        ${args.idempotencyKey}
      )
    `.execute(trx);
  }

  async applyProviderCallback(args: {
    readonly tenantId: string;
    readonly paymentId: string;
    readonly payload: ProviderCallbackPayload;
    readonly idempotencyKey: string;
  }): Promise<PaymentRecord> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      if (args.payload.providerEventId) {
        const existing = await sql<{ payment_id: string }>`
          select payment_id from app.payment_attempts
          where tenant_id = ${args.tenantId}::uuid
            and provider_event_id = ${args.payload.providerEventId}
          limit 1
        `.execute(trx);
        if (existing.rows[0]) {
          const replay = await this.loadPayment(trx, args.tenantId, existing.rows[0].payment_id);
          if (replay) return replay;
        }
      }

      const current = await this.loadPayment(trx, args.tenantId, args.paymentId, {
        forUpdate: true
      });
      if (!current) {
        throw new PaymentError("Payment not found.", "RESOURCE_NOT_FOUND");
      }
      if (current.amountMinor !== args.payload.amountMinor) {
        throw new PaymentError("Amount mismatch.", "PAYMENT_AMOUNT_MISMATCH");
      }
      if (current.currency !== args.payload.currency) {
        throw new PaymentError("Currency mismatch.", "PAYMENT_AMOUNT_MISMATCH");
      }

      const nextStatus: PaymentStatus =
        args.payload.status === "captured" ? "captured" : "failed";
      const attemptStatus = args.payload.status === "captured" ? "succeeded" : "failed";

      // Refunded payments are terminal — reject further provider mutations.
      if (current.status === "refunded" || current.status === "partially_refunded") {
        throw new PaymentError("Invalid payment state.", "PAYMENT_STATE_INVALID");
      }

      // Captured: ignore late failed/duplicate captured; do not downgrade.
      if (current.status === "captured") {
        await this.insertPaymentAttempt(trx, {
          tenantId: args.tenantId,
          paymentId: args.paymentId,
          status: attemptStatus,
          providerEventId: args.payload.providerEventId,
          idempotencyKey: args.idempotencyKey
        });
        return current;
      }

      const updated = await sql<PaymentRow>`
        update app.payments
        set status = ${nextStatus},
            provider = ${args.payload.provider},
            version = version + 1,
            updated_at = now()
        where id = ${args.paymentId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and status in ('pending', 'authorized', 'failed')
        returning id, tenant_id, order_id, status, amount_minor, currency, method,
                  provider, provider_ref, version, created_at, updated_at
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new PaymentError("Invalid payment state.", "PAYMENT_STATE_INVALID");
      }

      await this.insertPaymentAttempt(trx, {
        tenantId: args.tenantId,
        paymentId: args.paymentId,
        status: attemptStatus,
        providerEventId: args.payload.providerEventId,
        idempotencyKey: args.idempotencyKey
      });

      return toPayment(updated.rows[0], current.refundedMinor);
    });
  }

  async getIdempotentPayment(_tenantId: string, _key: string): Promise<PaymentRecord | null> {
    return null;
  }

  async rememberIdempotentPayment(
    _tenantId: string,
    _key: string,
    _payment: PaymentRecord
  ): Promise<void> {
    /* no-op — use IdempotencyStore */
  }

  async getProviderEvent(tenantId: string, providerEventId: string): Promise<PaymentRecord | null> {
    const cached = this.providerEvents.get(this.idemKey(tenantId, providerEventId));
    if (cached) return cached;
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const existing = await sql<{ payment_id: string }>`
        select payment_id from app.payment_attempts
        where tenant_id = ${tenantId}::uuid and provider_event_id = ${providerEventId}
        limit 1
      `.execute(trx);
      if (!existing.rows[0]) return null;
      const payment = await this.loadPayment(trx, tenantId, existing.rows[0].payment_id);
      if (payment) this.providerEvents.set(this.idemKey(tenantId, providerEventId), payment);
      return payment;
    });
  }

  async rememberProviderEvent(
    tenantId: string,
    providerEventId: string,
    payment: PaymentRecord
  ): Promise<void> {
    this.providerEvents.set(this.idemKey(tenantId, providerEventId), payment);
  }
}
