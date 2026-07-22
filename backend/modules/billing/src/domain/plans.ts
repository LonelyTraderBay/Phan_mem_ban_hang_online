/**
 * BE-BIL-001 — Plan catalog from HO_DEFAULTS_v1 (do not invent rates).
 */

export type PlanId = "plan_free" | "plan_pro" | "plan_business";

export interface PlanDefinition {
  readonly id: PlanId;
  readonly name: string;
  readonly monthlyPriceMinor: number;
  readonly seatsLimit: number;
  readonly ordersPerMonth: number;
  readonly aiSuggestionsPerDay: number;
  readonly channelAccountsLimit: number;
  readonly features: Record<string, boolean | string>;
}

export const HO_PLANS: Record<PlanId, PlanDefinition> = {
  plan_free: {
    id: "plan_free",
    name: "Free",
    monthlyPriceMinor: 0,
    seatsLimit: 2,
    ordersPerMonth: 50,
    aiSuggestionsPerDay: 20,
    channelAccountsLimit: 1,
    features: {
      "feature.web_admin": true,
      "feature.ai_copilot": "limited",
      "feature.desktop_client": false,
      "feature.ops_support_access": false
    }
  },
  plan_pro: {
    id: "plan_pro",
    name: "Pro",
    monthlyPriceMinor: 499_000,
    seatsLimit: 10,
    ordersPerMonth: 2_000,
    aiSuggestionsPerDay: 500,
    channelAccountsLimit: 5,
    features: {
      "feature.web_admin": true,
      "feature.ai_copilot": true,
      "feature.desktop_client": true,
      "feature.ops_support_access": false
    }
  },
  plan_business: {
    id: "plan_business",
    name: "Business",
    monthlyPriceMinor: 1_999_000,
    seatsLimit: 50,
    ordersPerMonth: 20_000,
    aiSuggestionsPerDay: 5_000,
    channelAccountsLimit: 20,
    features: {
      "feature.web_admin": true,
      "feature.ai_copilot": true,
      "feature.desktop_client": true,
      "feature.ops_support_access": true
    }
  }
};

export function getPlan(planId: PlanId): PlanDefinition {
  return HO_PLANS[planId];
}

export function calendarMonthPeriod(now = new Date()): { readonly start: Date; readonly end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}
