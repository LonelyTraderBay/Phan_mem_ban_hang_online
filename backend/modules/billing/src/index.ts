export const MODULE_NAME = "billing" as const;

export {
  BillingError,
  getBillingPlan,
  getBillingUsage,
  getEntitlementPolicy,
  manualUpdateSubscription,
  recordUsageEvent,
  requireBillingPermission,
  type BillingPermission,
  type BillingRepository
} from "./application/billing.js";

export { checkEntitlement, buildUsageSnapshot } from "./domain/entitlements.js";
export { HO_PLANS, getPlan, type PlanId } from "./domain/plans.js";
export { InMemoryBillingRepository } from "./infrastructure/persistence/in-memory-billing.js";
export { PostgresBillingRepository } from "./infrastructure/persistence/postgres-billing.js";
export { createBillingController } from "./presentation/http/billing.controller.js";
