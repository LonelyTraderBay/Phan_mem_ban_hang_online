import { describe, expect, it } from "vitest";
import { MemoryIdempotencyStore } from "@ai-sales/idempotency";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { createOrderDraft } from "./order.js";
import { InMemoryOrderRepository } from "../infrastructure/persistence/in-memory-order.js";
import type { CatalogPricingPort } from "./order.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e1b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e2b");
const customerId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e3b");
const variantId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e4b");

const catalog: CatalogPricingPort = {
  async getVariantPricing({ variantId: vid }) {
    if (vid !== variantId) return null;
    return { unitPriceMinor: 110_000, currency: "VND", costMinor: 80_000, sku: "SKU-1" };
  }
};

describe("order IdempotencyStore path", () => {
  it("replays create via MemoryIdempotencyStore", async () => {
    const repo = new InMemoryOrderRepository();
    const idempotency = new MemoryIdempotencyStore();
    const first = await createOrderDraft({
      repo,
      catalog,
      tenantId: tenantA,
      actorId,
      actorPermissions: ["order.create"],
      idempotencyKey: "store-ord-1",
      idempotency,
      customerId,
      items: [{ variant_id: variantId, quantity: "1" }]
    });
    const second = await createOrderDraft({
      repo,
      catalog,
      tenantId: tenantA,
      actorId,
      actorPermissions: ["order.create"],
      idempotencyKey: "store-ord-1",
      idempotency,
      customerId,
      items: [{ variant_id: variantId, quantity: "1" }]
    });
    expect(second.data.id).toBe(first.data.id);
  });
});
