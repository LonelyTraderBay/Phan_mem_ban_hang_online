import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { confirmOrder, createOrderDraft, OrderError } from "./order.js";
import { InMemoryOrderRepository } from "../infrastructure/persistence/in-memory-order.js";
import type { CatalogPricingPort, ReservationPort } from "./order.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e1b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e2b");
const customerId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e3b");
const variantId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e4b");
const reservationId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e5b");

const perms = ["order.read", "order.create", "order.confirm", "inventory.reserve"];

const catalog: CatalogPricingPort = {
  async getVariantPricing({ variantId: vid }) {
    if (vid !== variantId) return null;
    return { unitPriceMinor: 110_000, currency: "VND", costMinor: null, sku: null };
  }
};

describe("BE-ORD-008 concurrency", () => {
  it("parallel confirm attempts: only one succeeds", async () => {
    const repo = new InMemoryOrderRepository();
    let convertCount = 0;
    const reservation: ReservationPort = {
      async createReservation() {
        return { reservationId };
      },
      async convertReservation() {
        convertCount += 1;
        if (convertCount > 1) {
          throw new OrderError("Already converted.", "INVENTORY_RESERVATION_STATE_INVALID");
        }
      },
      async releaseReservation() {}
    };

    const draft = await createOrderDraft({
      repo,
      catalog,
      tenantId: tenantA,
      actorId,
      actorPermissions: perms,
      idempotencyKey: "conc-draft",
      customerId,
      items: [{ variant_id: variantId, quantity: "1" }]
    });
    const orderId = draft.data.id as string;
    const full = await repo.getOrder({ tenantId: tenantA, orderId });
    await repo.setReservation({
      tenantId: tenantA,
      orderId,
      reservationId,
      actorId
    });
    const row = await repo.getOrder({ tenantId: tenantA, orderId });

    const attempts = await Promise.allSettled(
      Array.from({ length: 3 }, (_, i) =>
        confirmOrder({
          repo,
          catalog,
          reservation,
          tenantId: tenantA,
          orderId,
          actorId,
          actorPermissions: perms,
          idempotencyKey: `conc-conf-${i}`,
          expectedOrderVersion: row!.version,
          quoteVersion: full!.quoteVersion,
          reservationId
        })
      )
    );

    const ok = attempts.filter((a) => a.status === "fulfilled");
    const fail = attempts.filter((a) => a.status === "rejected");
    expect(ok.length).toBe(1);
    expect(fail.length).toBe(2);
  });

  it("idempotent confirm returns same result", async () => {
    const repo = new InMemoryOrderRepository();
    const reservation: ReservationPort = {
      async createReservation() {
        return { reservationId };
      },
      async convertReservation() {},
      async releaseReservation() {}
    };
    const draft = await createOrderDraft({
      repo,
      catalog,
      tenantId: tenantA,
      actorId,
      actorPermissions: perms,
      idempotencyKey: "idem-draft",
      customerId,
      items: [{ variant_id: variantId, quantity: "1" }]
    });
    const orderId = draft.data.id as string;
    const full = await repo.getOrder({ tenantId: tenantA, orderId });
    await repo.setReservation({ tenantId: tenantA, orderId, reservationId, actorId });
    const row = await repo.getOrder({ tenantId: tenantA, orderId });
    const first = await confirmOrder({
      repo,
      catalog,
      reservation,
      tenantId: tenantA,
      orderId,
      actorId,
      actorPermissions: perms,
      idempotencyKey: "idem-conf",
      expectedOrderVersion: row!.version,
      quoteVersion: full!.quoteVersion,
      reservationId
    });
    const second = await confirmOrder({
      repo,
      catalog,
      reservation,
      tenantId: tenantA,
      orderId,
      actorId,
      actorPermissions: perms,
      idempotencyKey: "idem-conf",
      expectedOrderVersion: row!.version,
      quoteVersion: full!.quoteVersion,
      reservationId
    });
    expect(second.data.id).toBe(first.data.id);
    expect(second.data.status).toBe("confirmed");
  });
});
