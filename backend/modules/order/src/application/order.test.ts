import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  buildOrderFingerprint,
  cancelOrder,
  confirmOrder,
  createOrderDraft,
  OrderError,
  reserveOrderInventory,
  TAX_RATE_BPS
} from "./order.js";
import { InMemoryOrderRepository } from "../infrastructure/persistence/in-memory-order.js";
import type { CatalogPricingPort, ReservationPort } from "./order.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e1b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e2b");
const customerId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e3b");
const variantId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e4b");

const orderPerms = ["order.read", "order.create", "order.confirm", "order.cancel", "inventory.reserve"];

const catalog: CatalogPricingPort = {
  async getVariantPricing({ variantId: vid }) {
    if (vid !== variantId) return null;
    return { unitPriceMinor: 110_000, currency: "VND", costMinor: 80_000, sku: "SKU-1" };
  }
};

function makeReservationPort(): ReservationPort & { lastReservationId?: string } {
  const port: ReservationPort & { lastReservationId?: string } = {
    async createReservation(args) {
      port.lastReservationId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e5b");
      return { reservationId: port.lastReservationId };
    },
    async convertReservation() {},
    async releaseReservation() {}
  };
  return port;
}

describe("BE-ORD draft/confirm/cancel", () => {
  it("creates draft with HO_DEFAULTS tax fields", async () => {
    const repo = new InMemoryOrderRepository();
    const result = await createOrderDraft({
      repo,
      catalog,
      tenantId: tenantA,
      actorId,
      actorPermissions: orderPerms,
      idempotencyKey: "ord-create-1",
      customerId,
      items: [{ variant_id: variantId, quantity: "1" }]
    });
    expect(result.data.tax_rate_bps).toBe(TAX_RATE_BPS);
    expect(result.data.prices_tax_inclusive).toBe(true);
    expect(result.data.grand_total_minor).toBe(110_000);
  });

  it("idempotency replays same order", async () => {
    const repo = new InMemoryOrderRepository();
    const first = await createOrderDraft({
      repo,
      catalog,
      tenantId: tenantA,
      actorId,
      actorPermissions: orderPerms,
      idempotencyKey: "ord-idem",
      customerId,
      items: [{ variant_id: variantId, quantity: "1" }]
    });
    const second = await createOrderDraft({
      repo,
      catalog,
      tenantId: tenantA,
      actorId,
      actorPermissions: orderPerms,
      idempotencyKey: "ord-idem",
      customerId,
      items: [{ variant_id: variantId, quantity: "1" }]
    });
    expect(second.data.id).toBe(first.data.id);
  });

  it("duplicate fingerprint warns in meta", async () => {
    const repo = new InMemoryOrderRepository();
    await createOrderDraft({
      repo,
      catalog,
      tenantId: tenantA,
      actorId,
      actorPermissions: orderPerms,
      idempotencyKey: "ord-dup-1",
      customerId,
      items: [{ variant_id: variantId, quantity: "2" }]
    });
    const second = await createOrderDraft({
      repo,
      catalog,
      tenantId: tenantA,
      actorId,
      actorPermissions: orderPerms,
      idempotencyKey: "ord-dup-2",
      customerId,
      items: [{ variant_id: variantId, quantity: "2" }]
    });
    expect(second.meta.duplicate_suspected).toBe(true);
  });

  it("confirm requires matching quote_version and reservation", async () => {
    const repo = new InMemoryOrderRepository();
    const reservation = makeReservationPort();
    const draft = await createOrderDraft({
      repo,
      catalog,
      tenantId: tenantA,
      actorId,
      actorPermissions: orderPerms,
      idempotencyKey: "ord-flow-1",
      customerId,
      items: [{ variant_id: variantId, quantity: "1" }]
    });
    const orderId = draft.data.id as string;
    const full = await repo.getOrder({ tenantId: tenantA, orderId });
    await reserveOrderInventory({
      repo,
      reservation,
      tenantId: tenantA,
      orderId,
      actorId,
      actorPermissions: orderPerms,
      idempotencyKey: "ord-res-1"
    });
    const reserved = await repo.getOrder({ tenantId: tenantA, orderId });
    const confirmed = await confirmOrder({
      repo,
      catalog,
      reservation,
      tenantId: tenantA,
      orderId,
      actorId,
      actorPermissions: orderPerms,
      idempotencyKey: "ord-conf-1",
      expectedOrderVersion: reserved!.version,
      quoteVersion: full!.quoteVersion,
      reservationId: reservation.lastReservationId!
    });
    expect(confirmed.data.status).toBe("confirmed");
  });

  it("cancel releases reservation for draft", async () => {
    const repo = new InMemoryOrderRepository();
    const reservation = makeReservationPort();
    let released = false;
    reservation.releaseReservation = async () => {
      released = true;
    };
    const draft = await createOrderDraft({
      repo,
      catalog,
      tenantId: tenantA,
      actorId,
      actorPermissions: orderPerms,
      idempotencyKey: "ord-cancel-1",
      customerId,
      items: [{ variant_id: variantId, quantity: "1" }]
    });
    const orderId = draft.data.id as string;
    await reserveOrderInventory({
      repo,
      reservation,
      tenantId: tenantA,
      orderId,
      actorId,
      actorPermissions: orderPerms,
      idempotencyKey: "ord-cancel-res"
    });
    const row = await repo.getOrder({ tenantId: tenantA, orderId });
    const cancelled = await cancelOrder({
      repo,
      reservation,
      tenantId: tenantA,
      orderId,
      actorId,
      actorPermissions: orderPerms,
      idempotencyKey: "ord-cancel-cmd",
      expectedVersion: row!.version,
      reason: "customer changed mind"
    });
    expect(cancelled.data.status).toBe("cancelled");
    expect(released).toBe(true);
  });

  it("permission denied without order.create", async () => {
    const repo = new InMemoryOrderRepository();
    await expect(
      createOrderDraft({
        repo,
        catalog,
        tenantId: tenantA,
        actorId,
        actorPermissions: ["order.read"],
        idempotencyKey: "x",
        customerId,
        items: [{ variant_id: variantId, quantity: "1" }]
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" } satisfies Partial<OrderError>);
  });
});

describe("BE-ORD-007 fingerprint", () => {
  it("same items produce same fingerprint", () => {
    const fp1 = buildOrderFingerprint({
      customerId,
      items: [{ variantId, quantity: "1" }]
    });
    const fp2 = buildOrderFingerprint({
      customerId,
      items: [{ variantId, quantity: "1" }]
    });
    expect(fp1).toBe(fp2);
  });
});
