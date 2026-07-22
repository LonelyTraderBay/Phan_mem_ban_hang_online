import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { HO_PLANS } from "../domain/plans.js";
import { checkEntitlement } from "../domain/entitlements.js";
import {
  BillingError,
  getBillingPlan,
  manualUpdateSubscription,
  recordUsageEvent
} from "./billing.js";
import { InMemoryBillingRepository } from "../infrastructure/persistence/in-memory-billing.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d1b");
const billingPerms = ["billing.read", "billing.manage"];

describe("HO_DEFAULTS plans", () => {
  it("uses frozen plan rates", () => {
    expect(HO_PLANS.plan_pro.monthlyPriceMinor).toBe(499_000);
    expect(HO_PLANS.plan_business.seatsLimit).toBe(50);
  });

  it("hard blocks orders at quota", () => {
    const result = checkEntitlement({
      planId: "plan_free",
      meterKey: "orders_created",
      used: 50,
      increment: 1
    });
    expect(result.decision).toBe("hard_block");
  });
});

describe("billing application", () => {
  it("defaults tenant to plan_free", async () => {
    const repo = new InMemoryBillingRepository();
    const plan = await getBillingPlan({
      repo,
      tenantId: tenantA,
      actorPermissions: billingPerms
    });
    expect(plan.data.plan_id).toBe("plan_free");
    expect(plan.data.seats_limit).toBe(2);
  });

  it("upgrades subscription with idempotency", async () => {
    const repo = new InMemoryBillingRepository();
    const updated = await manualUpdateSubscription({
      repo,
      tenantId: tenantA,
      actorPermissions: billingPerms,
      idempotencyKey: "upgrade-1",
      planId: "plan_pro"
    });
    expect(updated.data.plan_id).toBe("plan_pro");
  });

  it("records usage idempotently", async () => {
    const repo = new InMemoryBillingRepository();
    const first = await recordUsageEvent({
      repo,
      tenantId: tenantA,
      meterKey: "orders_created",
      idempotencyKey: "order-1"
    });
    const second = await recordUsageEvent({
      repo,
      tenantId: tenantA,
      meterKey: "orders_created",
      idempotencyKey: "order-1"
    });
    expect(second.meter.usedCount).toBe(first.meter.usedCount);
  });

  it("denies billing read without permission", async () => {
    const repo = new InMemoryBillingRepository();
    await expect(
      getBillingPlan({ repo, tenantId: tenantA, actorPermissions: [] })
    ).rejects.toBeInstanceOf(BillingError);
  });
});
