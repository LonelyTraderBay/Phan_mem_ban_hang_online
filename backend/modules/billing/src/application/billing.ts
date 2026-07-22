import { generateUuidV7 } from "@ai-sales/domain-kernel";
import { buildUsageSnapshot, checkEntitlement, type MeterKey } from "../domain/entitlements.js";
import { calendarMonthPeriod, getPlan, type PlanId } from "../domain/plans.js";

/**
 * BE-BIL-001…003 — Billing application layer (in-memory until Postgres adapter).
 */

export type BillingPermission = "billing.read" | "billing.manage";

export type BillingErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "ENTITLEMENT_LIMIT_EXCEEDED";

export class BillingError extends Error {
  constructor(
    message: string,
    readonly code: BillingErrorCode
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export interface SubscriptionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly planId: PlanId;
  readonly status: "active" | "past_due" | "cancelled";
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly seatsUsed: number;
}

export interface UsageMeterRecord {
  readonly tenantId: string;
  readonly meterKey: MeterKey;
  readonly usedCount: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly idempotencyKey: string | null;
}

export interface BillingRepository {
  getSubscription(tenantId: string): Promise<SubscriptionRecord | null>;
  saveSubscription(subscription: SubscriptionRecord): Promise<void>;
  getMeter(tenantId: string, meterKey: MeterKey): Promise<UsageMeterRecord | null>;
  saveMeter(meter: UsageMeterRecord): Promise<void>;
  findMeterByIdempotency(tenantId: string, key: string): Promise<UsageMeterRecord | null>;
}

function usageFromMeters(
  orders: UsageMeterRecord | null,
  ai: UsageMeterRecord | null,
  channels: UsageMeterRecord | null
): Partial<Record<MeterKey, number>> {
  const usage: Partial<Record<MeterKey, number>> = {};
  if (orders) usage.orders_created = orders.usedCount;
  if (ai) usage.ai_suggestions = ai.usedCount;
  if (channels) usage.channel_accounts = channels.usedCount;
  return usage;
}
function toBillingResource(
  subscription: SubscriptionRecord,
  meters: Partial<Record<MeterKey, number>>
) {
  const plan = getPlan(subscription.planId);
  return {
    plan_id: subscription.planId,
    status: subscription.status,
    seats_used: subscription.seatsUsed,
    seats_limit: plan.seatsLimit,
    period_start: subscription.periodStart,
    period_end: subscription.periodEnd,
    usage: {
      orders_created: meters.orders_created ?? 0,
      ai_suggestions: meters.ai_suggestions ?? 0,
      channel_accounts: meters.channel_accounts ?? 0
    }
  };
}

export function requireBillingPermission(
  actorPermissions: readonly string[],
  permission: BillingPermission
): void {
  if (!actorPermissions.includes(permission)) {
    throw new BillingError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

async function ensureSubscription(repo: BillingRepository, tenantId: string): Promise<SubscriptionRecord> {
  const existing = await repo.getSubscription(tenantId);
  if (existing) return existing;
  const period = calendarMonthPeriod();
  const subscription: SubscriptionRecord = {
    id: generateUuidV7(),
    tenantId,
    planId: "plan_free",
    status: "active",
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    seatsUsed: 1
  };
  await repo.saveSubscription(subscription);
  return subscription;
}

export async function getBillingPlan(options: {
  readonly repo: BillingRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireBillingPermission(options.actorPermissions, "billing.read");
  const subscription = await ensureSubscription(options.repo, options.tenantId);
  const orders = await options.repo.getMeter(options.tenantId, "orders_created");
  const ai = await options.repo.getMeter(options.tenantId, "ai_suggestions");
  const channels = await options.repo.getMeter(options.tenantId, "channel_accounts");
  return {
    data: toBillingResource(subscription, usageFromMeters(orders, ai, channels)),
    meta: {}
  };
}

export async function getBillingUsage(options: {
  readonly repo: BillingRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  return getBillingPlan(options);
}

export async function manualUpdateSubscription(options: {
  readonly repo: BillingRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly planId: PlanId;
  readonly reason?: string | null;
}) {
  requireBillingPermission(options.actorPermissions, "billing.manage");
  if (!options.idempotencyKey?.trim()) {
    throw new BillingError("Idempotency-Key header required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  if (!getPlan(options.planId)) {
    throw new BillingError("Invalid plan.", "VALIDATION_FAILED");
  }
  const subscription = await ensureSubscription(options.repo, options.tenantId);
  const updated: SubscriptionRecord = {
    ...subscription,
    planId: options.planId
  };
  await options.repo.saveSubscription(updated);
  const orders = await options.repo.getMeter(options.tenantId, "orders_created");
  const ai = await options.repo.getMeter(options.tenantId, "ai_suggestions");
  const channels = await options.repo.getMeter(options.tenantId, "channel_accounts");
  return {
    data: toBillingResource(updated, usageFromMeters(orders, ai, channels)),
    meta: { reason: options.reason ?? null }
  };
}

export async function recordUsageEvent(options: {
  readonly repo: BillingRepository;
  readonly tenantId: string;
  readonly meterKey: MeterKey;
  readonly idempotencyKey: string;
  readonly increment?: number;
}): Promise<{ readonly meter: UsageMeterRecord; readonly entitlement: ReturnType<typeof checkEntitlement> }> {
  const cached = await options.repo.findMeterByIdempotency(options.tenantId, options.idempotencyKey);
  if (cached) {
    const subscription = await ensureSubscription(options.repo, options.tenantId);
    return {
      meter: cached,
      entitlement: checkEntitlement({
        planId: subscription.planId,
        meterKey: options.meterKey,
        used: cached.usedCount
      })
    };
  }
  const subscription = await ensureSubscription(options.repo, options.tenantId);
  const existing = await options.repo.getMeter(options.tenantId, options.meterKey);
  const period = calendarMonthPeriod();
  const nextUsed = (existing?.usedCount ?? 0) + (options.increment ?? 1);
  const entitlement = checkEntitlement({
    planId: subscription.planId,
    meterKey: options.meterKey,
    used: existing?.usedCount ?? 0,
    increment: options.increment ?? 1
  });
  if (entitlement.decision === "hard_block") {
    throw new BillingError("Plan meter limit exceeded.", "ENTITLEMENT_LIMIT_EXCEEDED");
  }
  const meter: UsageMeterRecord = {
    tenantId: options.tenantId,
    meterKey: options.meterKey,
    usedCount: nextUsed,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    idempotencyKey: options.idempotencyKey
  };
  await options.repo.saveMeter(meter);
  return { meter, entitlement };
}

export async function getEntitlementPolicy(options: {
  readonly repo: BillingRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireBillingPermission(options.actorPermissions, "billing.read");
  const subscription = await ensureSubscription(options.repo, options.tenantId);
  const orders = await options.repo.getMeter(options.tenantId, "orders_created");
  const ai = await options.repo.getMeter(options.tenantId, "ai_suggestions");
  const channels = await options.repo.getMeter(options.tenantId, "channel_accounts");
  const snapshot = buildUsageSnapshot(subscription.planId, usageFromMeters(orders, ai, channels));
  return {
    plan_id: subscription.planId,
    meters: snapshot.map((m) => ({
      ...m,
      check: checkEntitlement({
        planId: subscription.planId,
        meterKey: m.meterKey,
        used: m.used,
        increment: 1
      })
    }))
  };
}
