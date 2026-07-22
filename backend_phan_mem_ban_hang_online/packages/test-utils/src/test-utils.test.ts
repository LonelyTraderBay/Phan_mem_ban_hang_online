import { describe, expect, it } from "vitest";
import { Money } from "@ai-sales/domain-kernel";
import { MemoryIdempotencyStore } from "@ai-sales/idempotency";
import {
  assertCrossTenantDenied,
  assertMoneyMinorUnits,
  createTenantIsolationFixture,
  createTestSecurityContext,
  replayIdempotencyKey
} from "./index.js";

describe("test-utils invariant helpers", () => {
  it("builds distinct tenant isolation fixtures", () => {
    const { tenantA, tenantB } = createTenantIsolationFixture();
    expect(tenantA.tenantId).not.toBe(tenantB.tenantId);
  });

  it("treats empty results as cross-tenant deny", async () => {
    await expect(assertCrossTenantDenied(async () => [])).resolves.toBeUndefined();
    await expect(assertCrossTenantDenied(async () => [{ id: 1 }])).rejects.toThrow(/denied/);
  });

  it("replays idempotency keys without double execution", async () => {
    const store = new MemoryIdempotencyStore();
    const ctx = createTestSecurityContext();
    const result = await replayIdempotencyKey(
      store,
      ctx,
      { scope: "demo", key: "k1", requestHash: "h1", ttlSeconds: 60 },
      async () => ({ responseStatus: 200, responseBody: { ok: true }, resourceId: "r1" })
    );
    expect(result.executions).toBe(1);
    expect(result.second.outcome).toBe("replay");
  });

  it("asserts money minor units", () => {
    expect(() => assertMoneyMinorUnits(Money.fromMinorUnits(100n, "VND"), 100n, "VND")).not.toThrow();
    expect(() => assertMoneyMinorUnits(Money.fromMinorUnits(100n, "VND"), 99n, "VND")).toThrow(/Money mismatch/);
  });
});
