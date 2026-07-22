import type { PlanDefinition, PlanId } from "./plans.js";
import { getPlan } from "./plans.js";

/**
 * BE-BIL-003 — Soft/hard limit policy per HO_DEFAULTS_v1 §3.
 */

export type MeterKey = "orders_created" | "ai_suggestions" | "channel_accounts";

export type EntitlementDecision = "allow" | "soft_warn" | "hard_block";

export interface MeterUsage {
  readonly meterKey: MeterKey;
  readonly used: number;
  readonly limit: number;
}

export interface EntitlementCheckResult {
  readonly decision: EntitlementDecision;
  readonly meterKey: MeterKey;
  readonly used: number;
  readonly limit: number;
  readonly warningHeader: string | null;
}

function meterLimit(plan: PlanDefinition, meterKey: MeterKey): number {
  switch (meterKey) {
    case "orders_created":
      return plan.ordersPerMonth;
    case "ai_suggestions":
      return plan.aiSuggestionsPerDay;
    case "channel_accounts":
      return plan.channelAccountsLimit;
  }
}

export function checkEntitlement(options: {
  readonly planId: PlanId;
  readonly meterKey: MeterKey;
  readonly used: number;
  readonly increment?: number;
}): EntitlementCheckResult {
  const plan = getPlan(options.planId);
  const limit = meterLimit(plan, options.meterKey);
  const nextUsed = options.used + (options.increment ?? 1);

  if (nextUsed > limit) {
    return {
      decision: "hard_block",
      meterKey: options.meterKey,
      used: options.used,
      limit,
      warningHeader: null
    };
  }

  if (options.meterKey === "ai_suggestions" && nextUsed > limit * 1.0 && nextUsed <= limit * 1.1) {
    return {
      decision: "soft_warn",
      meterKey: options.meterKey,
      used: options.used,
      limit,
      warningHeader: `meter=${options.meterKey}`
    };
  }

  if (nextUsed >= limit * 0.9 && nextUsed <= limit) {
    return {
      decision: "soft_warn",
      meterKey: options.meterKey,
      used: options.used,
      limit,
      warningHeader: `meter=${options.meterKey}`
    };
  }

  return {
    decision: "allow",
    meterKey: options.meterKey,
    used: options.used,
    limit,
    warningHeader: null
  };
}

export function buildUsageSnapshot(
  planId: PlanId,
  meters: Partial<Record<MeterKey, number>>
): MeterUsage[] {
  const plan = getPlan(planId);
  return (["orders_created", "ai_suggestions", "channel_accounts"] as const).map((meterKey) => ({
    meterKey,
    used: meters[meterKey] ?? 0,
    limit: meterLimit(plan, meterKey)
  }));
}
