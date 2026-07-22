import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  createReturn,
  createShipment,
  markShipmentDelivered,
  markShipmentPacked,
  markShipmentShipped
} from "./fulfillment.js";
import { InMemoryFulfillmentRepository } from "../infrastructure/persistence/in-memory-fulfillment.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e1b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e2b");
const orderId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e3b");
const orderItemId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e4b");

const shipPerms = ["shipment.manage", "packing_slip.print"];

const variantId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e5b");

const orders = {
  async isOrderConfirmed() {
    return true;
  },
  async getOrderItemIds() {
    return [orderItemId];
  },
  async getOrderItemVariantIds() {
    return new Map([[orderItemId, variantId]]);
  }
};

describe("BE-FUL/RET fulfillment flow", () => {
  it("pack/ship/deliver shipment transitions", async () => {
    const repo = new InMemoryFulfillmentRepository();
    const created = await createShipment({
      repo,
      orders,
      tenantId: tenantA,
      orderId,
      actorId,
      actorPermissions: shipPerms,
      idempotencyKey: "ship-1",
      items: [{ order_item_id: orderItemId, quantity: "1" }]
    });
    const shipmentId = created.data.id as string;
    await markShipmentPacked({
      repo,
      tenantId: tenantA,
      shipmentId,
      actorId,
      actorPermissions: shipPerms,
      idempotencyKey: "pack-1"
    });
    await markShipmentShipped({
      repo,
      tenantId: tenantA,
      shipmentId,
      actorId,
      actorPermissions: shipPerms,
      idempotencyKey: "ship-out-1"
    });
    const delivered = await markShipmentDelivered({
      repo,
      tenantId: tenantA,
      shipmentId,
      actorId,
      actorPermissions: shipPerms,
      idempotencyKey: "deliver-1"
    });
    expect(delivered.data.status).toBe("delivered");
  });

  it("return receive/inspect/restock/refund flow stub", async () => {
    const repo = new InMemoryFulfillmentRepository();
    let restockedVariantId: string | null = null;
    const inventory = {
      async restockStub(args: { readonly variantId: string }) {
        restockedVariantId = args.variantId;
      }
    };
    const created = await createReturn({
      repo,
      orders,
      tenantId: tenantA,
      orderId,
      actorId,
      actorPermissions: shipPerms,
      idempotencyKey: "ret-1",
      reason: "damaged",
      items: [{ order_item_id: orderItemId, quantity: "1" }]
    });
    const returnId = created.data.id as string;
    const { approveReturn, receiveReturn, completeReturn } = await import("./fulfillment.js");
    await approveReturn({
      repo,
      tenantId: tenantA,
      returnId,
      actorId,
      actorPermissions: shipPerms,
      idempotencyKey: "ret-appr"
    });
    await receiveReturn({
      repo,
      tenantId: tenantA,
      returnId,
      actorId,
      actorPermissions: shipPerms,
      idempotencyKey: "ret-recv"
    });
    const done = await completeReturn({
      repo,
      orders,
      inventory,
      tenantId: tenantA,
      returnId,
      actorId,
      actorPermissions: shipPerms,
      idempotencyKey: "ret-done"
    });
    expect(done.data.status).toBe("completed");
    expect(restockedVariantId).toBe(variantId);
  });
});
