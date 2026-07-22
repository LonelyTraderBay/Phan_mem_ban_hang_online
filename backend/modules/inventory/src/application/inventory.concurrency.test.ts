import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  createInventoryAdjustment,
  createInventoryReservation,
  createWarehouse
} from "./inventory.js";
import { InMemoryInventoryRepository } from "../infrastructure/persistence/in-memory-inventory.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e1b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e2b");
const ownerId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e3b");
const variantId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e4b");

const adjustPerms = ["inventory.read", "inventory.adjust"];
const reservePerms = ["inventory.read", "inventory.reserve"];

function futureIso(): string {
  return new Date(Date.now() + 60_000).toISOString();
}

describe("BE-INV-008 concurrency", () => {
  it("parallel reservations cannot drive available_to_sell below zero", async () => {
    const repo = new InMemoryInventoryRepository();
    const wh = await createWarehouse({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: adjustPerms,
      idempotencyKey: "wh-conc",
      name: "Conc WH",
      code: "CONC"
    });
    const warehouseId = wh.data.id as string;
    await createInventoryAdjustment({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: adjustPerms,
      idempotencyKey: "adj-conc",
      warehouseId,
      variantId,
      quantityDelta: "10",
      reason: "seed"
    });

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        createInventoryReservation({
          repo,
          tenantId: tenantA,
          actorId,
          actorPermissions: reservePerms,
          idempotencyKey: `res-conc-${i}`,
          ownerType: "order",
          ownerId,
          expiresAt: futureIso(),
          items: [{ variant_id: variantId, quantity: "3", preferred_warehouse_id: warehouseId }]
        })
      )
    );

    const fulfilled = attempts.filter((r) => r.status === "fulfilled");
    const rejected = attempts.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBeLessThanOrEqual(3);
    expect(rejected.length).toBeGreaterThanOrEqual(2);

    const balanceMap = (repo as unknown as {
      balances: Map<string, Map<string, { onHand: number; reserved: number }>>;
    }).balances;
    const row = [...balanceMap.get(tenantA)!.values()][0]!;
    expect(row.reserved).toBeLessThanOrEqual(row.onHand);
    expect(row.onHand - row.reserved).toBeGreaterThanOrEqual(0);
  });

  it("idempotency keys return same warehouse on replay", async () => {
    const repo = new InMemoryInventoryRepository();
    const first = await createWarehouse({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: adjustPerms,
      idempotencyKey: "same-wh-key",
      name: "Dup",
      code: "DUP-A"
    });
    const second = await createWarehouse({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: adjustPerms,
      idempotencyKey: "same-wh-key",
      name: "Dup",
      code: "DUP-A"
    });
    expect(first.data.id).toBe(second.data.id);
  });
});
