import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import { generateUuidV7 } from "@ai-sales/domain-kernel";
import type { MeterKey } from "../../domain/entitlements.js";
import type {
  BillingRepository,
  SubscriptionRecord,
  UsageMeterRecord
} from "../../application/billing.js";
import type { PlanId } from "../../domain/plans.js";

type SubscriptionRow = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: SubscriptionRecord["status"];
  period_start: Date;
  period_end: Date;
  seats_used: number | string;
};

type MeterRow = {
  tenant_id: string;
  meter_key: string;
  used_count: number | string;
  period_start: Date;
  period_end: Date;
  idempotency_key: string | null;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code: unknown }).code) === "23505"
  );
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toSubscription(row: SubscriptionRow): SubscriptionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    planId: row.plan_id as PlanId,
    status: row.status,
    periodStart: toIso(row.period_start),
    periodEnd: toIso(row.period_end),
    seatsUsed: Number(row.seats_used)
  };
}

function toMeter(row: MeterRow): UsageMeterRecord {
  return {
    tenantId: row.tenant_id,
    meterKey: row.meter_key as MeterKey,
    usedCount: Number(row.used_count),
    periodStart: toIso(row.period_start),
    periodEnd: toIso(row.period_end),
    idempotencyKey: row.idempotency_key
  };
}

export class PostgresBillingRepository implements BillingRepository {
  constructor(private readonly db: AppDatabase) {}

  async getSubscription(tenantId: string): Promise<SubscriptionRecord | null> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<SubscriptionRow>`
        select id, tenant_id, plan_id, status, period_start, period_end, seats_used
        from app.subscriptions
        where tenant_id = ${tenantId}::uuid
          and status = 'active'
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      return row ? toSubscription(row) : null;
    });
  }

  async saveSubscription(subscription: SubscriptionRecord): Promise<void> {
    const ctx = adapterSecurityContext(subscription.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      const existing = await sql<{ id: string }>`
        select id
        from app.subscriptions
        where tenant_id = ${subscription.tenantId}::uuid
          and status = 'active'
        limit 1
      `.execute(trx);

      if (existing.rows[0]) {
        await sql`
          update app.subscriptions
          set plan_id = ${subscription.planId},
              status = ${subscription.status},
              period_start = ${subscription.periodStart}::timestamptz,
              period_end = ${subscription.periodEnd}::timestamptz,
              seats_used = ${subscription.seatsUsed},
              updated_at = now()
          where tenant_id = ${subscription.tenantId}::uuid
            and status = 'active'
        `.execute(trx);
        return;
      }

      const id = subscription.id || generateUuidV7();
      await sql`
        insert into app.subscriptions (
          id, tenant_id, plan_id, status, period_start, period_end, seats_used
        ) values (
          ${id}::uuid,
          ${subscription.tenantId}::uuid,
          ${subscription.planId},
          ${subscription.status},
          ${subscription.periodStart}::timestamptz,
          ${subscription.periodEnd}::timestamptz,
          ${subscription.seatsUsed}
        )
      `.execute(trx);
    });
  }

  async getMeter(tenantId: string, meterKey: MeterKey): Promise<UsageMeterRecord | null> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<MeterRow>`
        select tenant_id, meter_key, used_count, period_start, period_end, idempotency_key
        from app.usage_meters
        where tenant_id = ${tenantId}::uuid
          and meter_key = ${meterKey}
        order by period_start desc
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      return row ? toMeter(row) : null;
    });
  }

  async saveMeter(meter: UsageMeterRecord): Promise<void> {
    const ctx = adapterSecurityContext(meter.tenantId);
    try {
      await withTenantTransaction(this.db, ctx, async (trx) => {
        const id = generateUuidV7();
        await sql`
          insert into app.usage_meters (
            id, tenant_id, meter_key, period_start, period_end, used_count, idempotency_key
          ) values (
            ${id}::uuid,
            ${meter.tenantId}::uuid,
            ${meter.meterKey},
            ${meter.periodStart}::timestamptz,
            ${meter.periodEnd}::timestamptz,
            ${meter.usedCount},
            ${meter.idempotencyKey}
          )
          on conflict (tenant_id, meter_key, period_start) do update set
            used_count = excluded.used_count,
            period_end = excluded.period_end,
            idempotency_key = coalesce(excluded.idempotency_key, app.usage_meters.idempotency_key),
            updated_at = now()
        `.execute(trx);
      });
    } catch (error) {
      if (!isUniqueViolation(error) || !meter.idempotencyKey) throw error;
      const existing = await this.findMeterByIdempotency(meter.tenantId, meter.idempotencyKey);
      if (!existing) throw error;
    }
  }

  async findMeterByIdempotency(
    tenantId: string,
    key: string
  ): Promise<UsageMeterRecord | null> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<MeterRow>`
        select tenant_id, meter_key, used_count, period_start, period_end, idempotency_key
        from app.usage_meters
        where tenant_id = ${tenantId}::uuid
          and idempotency_key = ${key}
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      return row ? toMeter(row) : null;
    });
  }
}
