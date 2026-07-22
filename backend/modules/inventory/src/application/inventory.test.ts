import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  convertInventoryReservation,
  createInventoryAdjustment,
  createInventoryReconciliation,
  createInventoryReservation,
  createWarehouse,
  expireInventoryReservations,
  extendInventoryReservation,
  getInventoryAdjustment,
  listBalances,
  listMovements,
  releaseInventoryReservation,
  updateWarehouse
} from "./inventory.js";
import { InMemoryInventoryRepository } from "../infrastructure/persistence/in-memory-inventory.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d1b");
const tenantB = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d2b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d3b");
const ownerId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d4b");
const variantId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d5b");

const readPerms = ["inventory.read"];
const adjustPerms = ["inventory.read", "inventory.adjust"];
const reservePerms = ["inventory.read", "inventory.reserve"];
const convertPerms = ["inventory.reserve", "internal.order.confirm"];

function futureIso(ms = 60_000): string {
  return new Date(Date.now() + ms).toISOString();
}

async function seedWarehouseAndStock(repo: InMemoryInventoryRepository, tenantId: string) {
  const wh = await createWarehouse({
    repo,
    tenantId,
    actorId,
    actorPermissions: adjustPerms,
    idempotencyKey: `wh-${tenantId.slice(-4)}`,
    name: "Main WH",
    code: `WH-${tenantId.slice(-4)}`
  });
  const warehouseId = wh.data.id as string;
  await createInventoryAdjustment({
    repo,
    tenantId,
    actorId,
    actorPermissions: adjustPerms,
    idempotencyKey: `adj-seed-${tenantId.slice(-4)}`,
    warehouseId,
    variantId,
    quantityDelta: "100",
    reason: "seed stock"
  });
  return warehouseId;
}

describe("BE-INV-002 balances", () => {
  it("lists balances with available_to_sell derived", async () => {
    const repo = new InMemoryInventoryRepository();
    const warehouseId = await seedWarehouseAndStock(repo, tenantA);
    const balances = await listBalances({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms
    });
    const row = balances.data.find((b) => b.warehouse_id === warehouseId);
    expect(row?.on_hand).toBe("100");
    expect(row?.available_to_sell).toBe("100");
    expect(row?.reserved).toBe("0");
  });

  it("inventory.read permission enforced", async () => {
    const repo = new InMemoryInventoryRepository();
    await expect(
      listBalances({ repo, tenantId: tenantA, actorPermissions: [] })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });
});

describe("BE-INV-003 adjustments", () => {
  it("creates adjustment, appends movement, updates balance", async () => {
    const repo = new InMemoryInventoryRepository();
    const warehouseId = await seedWarehouseAndStock(repo, tenantA);
    const created = await createInventoryAdjustment({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: adjustPerms,
      idempotencyKey: "adj-1",
      warehouseId,
      variantId,
      quantityDelta: "-10",
      reason: "cycle count"
    });
    expect(created.data.quantity_delta).toBe("-10");
    const fetched = await getInventoryAdjustment({
      repo,
      tenantId: tenantA,
      adjustmentId: created.data.id as string,
      actorPermissions: readPerms
    });
    expect(fetched.data.id).toBe(created.data.id);
    const balances = await listBalances({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms
    });
    expect(balances.data[0]?.on_hand).toBe("90");
    const movements = await listMovements({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms
    });
    expect(movements.data.length).toBeGreaterThanOrEqual(2);
    expect(repo.auditLog.some((a) => a.action === "inventory.adjusted")).toBe(true);
  });

  it("rejects adjustment that would make on_hand negative", async () => {
    const repo = new InMemoryInventoryRepository();
    const warehouseId = await seedWarehouseAndStock(repo, tenantA);
    await expect(
      createInventoryAdjustment({
        repo,
        tenantId: tenantA,
        actorId,
        actorPermissions: adjustPerms,
        idempotencyKey: "adj-over",
        warehouseId,
        variantId,
        quantityDelta: "-200",
        reason: "too much"
      })
    ).rejects.toMatchObject({ code: "INVENTORY_INSUFFICIENT" });
  });

  it("idempotent adjustment replay returns same result", async () => {
    const repo = new InMemoryInventoryRepository();
    const warehouseId = await seedWarehouseAndStock(repo, tenantA);
    const first = await createInventoryAdjustment({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: adjustPerms,
      idempotencyKey: "adj-idem",
      warehouseId,
      variantId,
      quantityDelta: "5",
      reason: "restock"
    });
    const second = await createInventoryAdjustment({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: adjustPerms,
      idempotencyKey: "adj-idem",
      warehouseId,
      variantId,
      quantityDelta: "5",
      reason: "restock"
    });
    expect(second.data.id).toBe(first.data.id);
  });
});

describe("BE-INV-004 reservation create", () => {
  it("reserves stock with deterministic lock order", async () => {
    const repo = new InMemoryInventoryRepository();
    const warehouseId = await seedWarehouseAndStock(repo, tenantA);
    const reservation = await createInventoryReservation({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: reservePerms,
      idempotencyKey: "res-1",
      ownerType: "order",
      ownerId,
      expiresAt: futureIso(),
      items: [{ variant_id: variantId, quantity: "20", preferred_warehouse_id: warehouseId }]
    });
    expect(reservation.data.status).toBe("active");
    expect(reservation.data.allocations).toHaveLength(1);
    const balances = await listBalances({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms
    });
    expect(balances.data[0]?.reserved).toBe("20");
    expect(balances.data[0]?.available_to_sell).toBe("80");
  });

  it("rejects reservation when insufficient stock", async () => {
    const repo = new InMemoryInventoryRepository();
    const warehouseId = await seedWarehouseAndStock(repo, tenantA);
    await expect(
      createInventoryReservation({
        repo,
        tenantId: tenantA,
        actorId,
        actorPermissions: reservePerms,
        idempotencyKey: "res-fail",
        ownerType: "order",
        ownerId,
        expiresAt: futureIso(),
        items: [{ variant_id: variantId, quantity: "500", preferred_warehouse_id: warehouseId }]
      })
    ).rejects.toMatchObject({ code: "INVENTORY_INSUFFICIENT" });
  });
});

describe("BE-INV-005 reservation state machine", () => {
  it("release/extend/convert transitions", async () => {
    const repo = new InMemoryInventoryRepository();
    const warehouseId = await seedWarehouseAndStock(repo, tenantA);
    const created = await createInventoryReservation({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: reservePerms,
      idempotencyKey: "res-sm",
      ownerType: "order",
      ownerId,
      expiresAt: futureIso(),
      items: [{ variant_id: variantId, quantity: "10", preferred_warehouse_id: warehouseId }]
    });
    const reservationId = created.data.id as string;
    const extended = await extendInventoryReservation({
      repo,
      tenantId: tenantA,
      reservationId,
      actorId,
      actorPermissions: reservePerms,
      idempotencyKey: "res-extend",
      expiresAt: futureIso(120_000),
      expectedVersion: created.data.version as number
    });
    expect(extended.data.status).toBe("active");

    const converted = await convertInventoryReservation({
      repo,
      tenantId: tenantA,
      reservationId,
      ownerId,
      actorId,
      actorPermissions: convertPerms,
      idempotencyKey: "res-convert"
    });
    expect(converted.data.status).toBe("converted");
    const balances = await listBalances({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms
    });
    expect(balances.data[0]?.on_hand).toBe("90");
    expect(balances.data[0]?.reserved).toBe("0");
  });

  it("release is idempotent", async () => {
    const repo = new InMemoryInventoryRepository();
    const warehouseId = await seedWarehouseAndStock(repo, tenantA);
    const created = await createInventoryReservation({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: reservePerms,
      idempotencyKey: "res-rel",
      ownerType: "manual",
      ownerId,
      expiresAt: futureIso(),
      items: [{ variant_id: variantId, quantity: "5", preferred_warehouse_id: warehouseId }]
    });
    const reservationId = created.data.id as string;
    const first = await releaseInventoryReservation({
      repo,
      tenantId: tenantA,
      reservationId,
      actorId,
      actorPermissions: reservePerms,
      idempotencyKey: "rel-idem"
    });
    const second = await releaseInventoryReservation({
      repo,
      tenantId: tenantA,
      reservationId,
      actorId,
      actorPermissions: reservePerms,
      idempotencyKey: "rel-idem"
    });
    expect(second.data.status).toBe("released");
    expect(second.data.id).toBe(first.data.id);
    const balances = await listBalances({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms
    });
    expect(balances.data[0]?.reserved).toBe("0");
  });

  it("convert rejects owner mismatch", async () => {
    const repo = new InMemoryInventoryRepository();
    const warehouseId = await seedWarehouseAndStock(repo, tenantA);
    const created = await createInventoryReservation({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: reservePerms,
      idempotencyKey: "res-owner",
      ownerType: "order",
      ownerId,
      expiresAt: futureIso(),
      items: [{ variant_id: variantId, quantity: "5", preferred_warehouse_id: warehouseId }]
    });
    await expect(
      convertInventoryReservation({
        repo,
        tenantId: tenantA,
        reservationId: created.data.id as string,
        ownerId: parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d9b"),
        actorId,
        actorPermissions: convertPerms,
        idempotencyKey: "conv-bad-owner"
      })
    ).rejects.toMatchObject({ code: "INVENTORY_RESERVATION_OWNER_MISMATCH" });
  });
});

describe("BE-INV-006 expiry helper", () => {
  it("expires active reservations past expires_at", async () => {
    const repo = new InMemoryInventoryRepository();
    const warehouseId = await seedWarehouseAndStock(repo, tenantA);
    await createInventoryReservation({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: reservePerms,
      idempotencyKey: "res-exp",
      ownerType: "manual",
      ownerId,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      items: [{ variant_id: variantId, quantity: "15", preferred_warehouse_id: warehouseId }]
    });
    const expired = await expireInventoryReservations({
      repo,
      tenantId: tenantA,
      actorId
    });
    expect(expired).toHaveLength(1);
    expect(expired[0]?.status).toBe("expired");
    const balances = await listBalances({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms
    });
    expect(balances.data[0]?.reserved).toBe("0");
  });
});

describe("BE-INV-007 reconciliation", () => {
  it("detects ledger vs balance discrepancy", async () => {
    const repo = new InMemoryInventoryRepository();
    const warehouseId = await seedWarehouseAndStock(repo, tenantA);
    const balanceMap = (repo as unknown as { balances: Map<string, Map<string, { onHand: number }>> })
      .balances;
    const row = [...balanceMap.get(tenantA)!.values()][0]!;
    row.onHand = 50;

    const job = await createInventoryReconciliation({
      repo,
      tenantId: tenantA,
      actorPermissions: adjustPerms,
      idempotencyKey: "recon-1",
      warehouseId
    });
    expect(job.data.discrepancies.length).toBeGreaterThan(0);
    expect(job.data.discrepancies[0]?.delta).not.toBe("0");
  });
});

describe("warehouses CRUD-lite", () => {
  it("create + update warehouse", async () => {
    const repo = new InMemoryInventoryRepository();
    const created = await createWarehouse({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: adjustPerms,
      idempotencyKey: "wh-create",
      name: "North",
      code: "NORTH"
    });
    expect(created.data.name).toBe("North");
    const updated = await updateWarehouse({
      repo,
      tenantId: tenantA,
      warehouseId: created.data.id as string,
      actorId,
      actorPermissions: adjustPerms,
      expectedVersion: created.version,
      name: "North Hub"
    });
    expect(updated.data.name).toBe("North Hub");
  });

  it("tenant B cannot see tenant A warehouses via repo isolation", async () => {
    const repo = new InMemoryInventoryRepository();
    await seedWarehouseAndStock(repo, tenantA);
    const balancesB = await listBalances({
      repo,
      tenantId: tenantB,
      actorPermissions: readPerms
    });
    expect(balancesB.data).toHaveLength(0);
  });
});
