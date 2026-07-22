import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  availableToSell,
  formatQuantity,
  InventoryError,
  type AdjustmentRecord,
  type BalanceRecord,
  type InventoryAuditRecord,
  type InventoryRepository,
  type MovementRecord,
  type ReconciliationDiscrepancy,
  type ReconciliationJobRecord,
  type ReservationAllocation,
  type ReservationRecord,
  type ReservationStatus,
  type WarehouseRecord
} from "../../application/inventory.js";

type BalanceRow = {
  id: string;
  tenantId: string;
  warehouseId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  blocked: number;
  damaged: number;
  safetyStock: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type ReservationRow = {
  id: string;
  tenantId: string;
  ownerType: "order" | "conversation" | "manual";
  ownerId: string;
  status: ReservationStatus;
  expiresAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  allocations: ReservationAllocation[];
};

function balanceKey(warehouseId: string, variantId: string): string {
  return `${warehouseId}:${variantId}`;
}

function toBalanceRecord(row: BalanceRow): BalanceRecord {
  const available = availableToSell({
    onHand: row.onHand,
    reserved: row.reserved,
    blocked: row.blocked,
    damaged: row.damaged,
    safetyStock: row.safetyStock
  });
  return {
    id: row.id,
    tenant_id: row.tenantId,
    status: "active",
    version: row.version,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    warehouse_id: row.warehouseId,
    variant_id: row.variantId,
    on_hand: formatQuantity(row.onHand),
    reserved: formatQuantity(row.reserved),
    blocked: formatQuantity(row.blocked),
    damaged: formatQuantity(row.damaged),
    safety_stock: formatQuantity(row.safetyStock),
    available_to_sell: formatQuantity(available)
  };
}

export class InMemoryInventoryRepository implements InventoryRepository {
  private readonly warehouses = new Map<string, Map<string, WarehouseRecord>>();
  private readonly balances = new Map<string, Map<string, BalanceRow>>();
  private readonly movements = new Map<string, MovementRecord[]>();
  private readonly reservations = new Map<string, Map<string, ReservationRow>>();
  private readonly adjustments = new Map<string, Map<string, AdjustmentRecord>>();
  private readonly reconciliationJobs = new Map<string, Map<string, ReconciliationJobRecord>>();

  private readonly warehouseIdempotency = new Map<string, WarehouseRecord>();
  private readonly adjustmentIdempotency = new Map<string, AdjustmentRecord>();
  private readonly reservationIdempotency = new Map<string, ReservationRecord>();
  private readonly reservationCommandIdempotency = new Map<string, ReservationRecord>();
  private readonly reconciliationIdempotency = new Map<string, ReconciliationJobRecord>();

  readonly auditLog: InventoryAuditRecord[] = [];

  /** Per-tenant mutex for serializing balance mutations. */
  private readonly tenantLocks = new Map<string, Promise<void>>();

  private async withTenantLock<T>(tenantId: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = this.tenantLocks.get(tenantId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tenantLocks.set(
      tenantId,
      prev.then(() => gate)
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private warehouseMap(tenantId: string): Map<string, WarehouseRecord> {
    let map = this.warehouses.get(tenantId);
    if (!map) {
      map = new Map();
      this.warehouses.set(tenantId, map);
    }
    return map;
  }

  private balanceMap(tenantId: string): Map<string, BalanceRow> {
    let map = this.balances.get(tenantId);
    if (!map) {
      map = new Map();
      this.balances.set(tenantId, map);
    }
    return map;
  }

  private reservationMap(tenantId: string): Map<string, ReservationRow> {
    let map = this.reservations.get(tenantId);
    if (!map) {
      map = new Map();
      this.reservations.set(tenantId, map);
    }
    return map;
  }

  private adjustmentMap(tenantId: string): Map<string, AdjustmentRecord> {
    let map = this.adjustments.get(tenantId);
    if (!map) {
      map = new Map();
      this.adjustments.set(tenantId, map);
    }
    return map;
  }

  private reconciliationMap(tenantId: string): Map<string, ReconciliationJobRecord> {
    let map = this.reconciliationJobs.get(tenantId);
    if (!map) {
      map = new Map();
      this.reconciliationJobs.set(tenantId, map);
    }
    return map;
  }

  private movementList(tenantId: string): MovementRecord[] {
    let list = this.movements.get(tenantId);
    if (!list) {
      list = [];
      this.movements.set(tenantId, list);
    }
    return list;
  }

  private ensureWarehouse(tenantId: string, warehouseId: string): WarehouseRecord {
    const wh = this.warehouseMap(tenantId).get(warehouseId);
    if (!wh) {
      throw new InventoryError("Warehouse not found.", "RESOURCE_NOT_FOUND");
    }
    return wh;
  }

  private getOrCreateBalance(tenantId: string, warehouseId: string, variantId: string): BalanceRow {
    const map = this.balanceMap(tenantId);
    const key = balanceKey(warehouseId, variantId);
    let row = map.get(key);
    if (!row) {
      const now = new Date().toISOString();
      row = {
        id: generateUuidV7(),
        tenantId,
        warehouseId,
        variantId,
        onHand: 0,
        reserved: 0,
        blocked: 0,
        damaged: 0,
        safetyStock: 0,
        version: 1,
        createdAt: now,
        updatedAt: now
      };
      map.set(key, row);
    }
    return row;
  }

  private appendMovement(args: {
    readonly tenantId: string;
    readonly warehouseId: string;
    readonly variantId: string;
    readonly movementType: string;
    readonly quantityDelta: number;
    readonly beforeOnHand: number;
    readonly afterOnHand: number;
    readonly actorId: string;
    readonly reason: string | null;
    readonly referenceType: string | null;
    readonly referenceId: string | null;
    readonly adjustmentId: string | null;
    readonly reservationId: string | null;
    readonly idempotencyKey: string | null;
  }): MovementRecord {
    const movement: MovementRecord = {
      id: generateUuidV7(),
      tenant_id: args.tenantId,
      warehouse_id: args.warehouseId,
      variant_id: args.variantId,
      movement_type: args.movementType,
      quantity_delta: formatQuantity(args.quantityDelta),
      before_on_hand: formatQuantity(args.beforeOnHand),
      after_on_hand: formatQuantity(args.afterOnHand),
      reference_type: args.referenceType,
      reference_id: args.referenceId,
      reason: args.reason,
      actor_id: args.actorId,
      occurred_at: new Date().toISOString(),
      adjustment_id: args.adjustmentId,
      reservation_id: args.reservationId
    };
    this.movementList(args.tenantId).push(movement);
    return movement;
  }

  private toReservationRecord(row: ReservationRow): ReservationRecord {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      status: row.status,
      expires_at: row.expiresAt,
      version: row.version,
      owner_type: row.ownerType,
      owner_id: row.ownerId,
      allocations: row.allocations,
      created_at: row.createdAt,
      updated_at: row.updatedAt
    };
  }

  async listWarehouses(tenantId: string): Promise<readonly WarehouseRecord[]> {
    return [...this.warehouseMap(tenantId).values()];
  }

  async createWarehouse(args: {
    readonly tenantId: string;
    readonly warehouseId: UuidV7;
    readonly code: string;
    readonly name: string;
    readonly address: string | null;
    readonly actorId: string;
  }): Promise<WarehouseRecord> {
    const map = this.warehouseMap(args.tenantId);
    for (const wh of map.values()) {
      if (wh.code === args.code) {
        throw new InventoryError("Warehouse code already exists.", "VALIDATION_FAILED");
      }
    }
    const now = new Date().toISOString();
    const warehouse: WarehouseRecord = {
      id: args.warehouseId,
      tenant_id: args.tenantId,
      status: "active",
      version: 1,
      created_at: now,
      updated_at: now,
      code: args.code,
      name: args.name,
      address: args.address
    };
    map.set(warehouse.id, warehouse);
    return warehouse;
  }

  async updateWarehouse(args: {
    readonly tenantId: string;
    readonly warehouseId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
    readonly address: string | null | undefined;
    readonly actorId: string;
  }): Promise<WarehouseRecord> {
    const map = this.warehouseMap(args.tenantId);
    const row = map.get(args.warehouseId);
    if (!row) {
      throw new InventoryError("Warehouse not found.", "RESOURCE_NOT_FOUND");
    }
    if (row.version !== args.expectedVersion) {
      throw new InventoryError("Warehouse version conflict.", "RESOURCE_VERSION_MISMATCH");
    }
    const updated: WarehouseRecord = {
      ...row,
      name: args.name !== undefined && args.name !== null ? args.name : row.name,
      address: args.address !== undefined ? args.address : row.address,
      version: row.version + 1,
      updated_at: new Date().toISOString()
    };
    map.set(updated.id, updated);
    return updated;
  }

  async getWarehouse(args: {
    readonly tenantId: string;
    readonly warehouseId: string;
  }): Promise<WarehouseRecord | null> {
    return this.warehouseMap(args.tenantId).get(args.warehouseId) ?? null;
  }

  async listBalances(tenantId: string): Promise<readonly BalanceRecord[]> {
    return [...this.balanceMap(tenantId).values()].map(toBalanceRecord);
  }

  async listMovements(tenantId: string): Promise<readonly MovementRecord[]> {
    return [...this.movementList(tenantId)];
  }

  async createAdjustment(args: {
    readonly tenantId: string;
    readonly adjustmentId: UuidV7;
    readonly warehouseId: string;
    readonly variantId: string;
    readonly quantityDelta: number;
    readonly reason: string;
    readonly actorId: string;
    readonly idempotencyKey: string;
  }): Promise<AdjustmentRecord> {
    return this.withTenantLock(args.tenantId, async () => {
      this.ensureWarehouse(args.tenantId, args.warehouseId);
      const balance = this.getOrCreateBalance(args.tenantId, args.warehouseId, args.variantId);
      const before = balance.onHand;
      const after = before + args.quantityDelta;
      if (after < 0) {
        throw new InventoryError("Insufficient on-hand quantity.", "INVENTORY_INSUFFICIENT");
      }
      balance.onHand = after;
      balance.version += 1;
      balance.updatedAt = new Date().toISOString();

      const movementType = args.quantityDelta >= 0 ? "adjust_in" : "adjust_out";
      const now = new Date().toISOString();
      const adjustment: AdjustmentRecord = {
        id: args.adjustmentId,
        tenant_id: args.tenantId,
        status: "posted",
        version: 1,
        created_at: now,
        updated_at: now,
        warehouse_id: args.warehouseId,
        variant_id: args.variantId,
        quantity_delta: formatQuantity(args.quantityDelta),
        reason: args.reason
      };
      this.adjustmentMap(args.tenantId).set(adjustment.id, adjustment);
      this.appendMovement({
        tenantId: args.tenantId,
        warehouseId: args.warehouseId,
        variantId: args.variantId,
        movementType,
        quantityDelta: args.quantityDelta,
        beforeOnHand: before,
        afterOnHand: after,
        actorId: args.actorId,
        reason: args.reason,
        referenceType: "adjustment",
        referenceId: adjustment.id,
        adjustmentId: adjustment.id,
        reservationId: null,
        idempotencyKey: args.idempotencyKey
      });
      return adjustment;
    });
  }

  async getAdjustment(args: {
    readonly tenantId: string;
    readonly adjustmentId: string;
  }): Promise<AdjustmentRecord | null> {
    return this.adjustmentMap(args.tenantId).get(args.adjustmentId) ?? null;
  }

  private pickWarehouseForVariant(
    tenantId: string,
    variantId: string,
    quantity: number,
    preferredWarehouseId: string | null,
    strategy: "preferred_only" | "preferred_then_available" | "any_available"
  ): { warehouseId: string; availableAfter: number } {
    const candidates: { warehouseId: string; available: number }[] = [];
    for (const row of this.balanceMap(tenantId).values()) {
      if (row.variantId !== variantId) continue;
      const available = availableToSell({
        onHand: row.onHand,
        reserved: row.reserved,
        blocked: row.blocked,
        damaged: row.damaged,
        safetyStock: row.safetyStock
      });
      if (available >= quantity) {
        candidates.push({ warehouseId: row.warehouseId, available });
      }
    }
    if (preferredWarehouseId) {
      const preferred = candidates.find((c) => c.warehouseId === preferredWarehouseId);
      if (preferred) {
        return {
          warehouseId: preferred.warehouseId,
          availableAfter: preferred.available - quantity
        };
      }
      if (strategy === "preferred_only") {
        throw new InventoryError("Insufficient stock at preferred warehouse.", "INVENTORY_INSUFFICIENT");
      }
    }
    if (candidates.length === 0) {
      throw new InventoryError("Insufficient available stock.", "INVENTORY_INSUFFICIENT");
    }
    candidates.sort((a, b) => a.warehouseId.localeCompare(b.warehouseId));
    const picked = candidates[0]!;
    return { warehouseId: picked.warehouseId, availableAfter: picked.available - quantity };
  }

  async createReservation(args: {
    readonly tenantId: string;
    readonly reservationId: UuidV7;
    readonly ownerType: "order" | "conversation" | "manual";
    readonly ownerId: string;
    readonly expiresAt: string;
    readonly items: readonly {
      readonly variantId: string;
      readonly quantity: number;
      readonly preferredWarehouseId: string | null;
    }[];
    readonly allocationStrategy: "preferred_only" | "preferred_then_available" | "any_available";
    readonly actorId: string;
    readonly idempotencyKey: string;
  }): Promise<ReservationRecord> {
    return this.withTenantLock(args.tenantId, async () => {
      const sortedItems = [...args.items].sort((a, b) => {
        const whA = a.preferredWarehouseId ?? "";
        const whB = b.preferredWarehouseId ?? "";
        const whCmp = whA.localeCompare(whB);
        if (whCmp !== 0) return whCmp;
        return a.variantId.localeCompare(b.variantId);
      });

      const allocations: ReservationAllocation[] = [];
      const lockTargets: { warehouseId: string; variantId: string; quantity: number }[] = [];

      for (const item of sortedItems) {
        const pick = this.pickWarehouseForVariant(
          args.tenantId,
          item.variantId,
          item.quantity,
          item.preferredWarehouseId,
          args.allocationStrategy
        );
        lockTargets.push({
          warehouseId: pick.warehouseId,
          variantId: item.variantId,
          quantity: item.quantity
        });
        allocations.push({
          variant_id: item.variantId,
          warehouse_id: pick.warehouseId,
          quantity: formatQuantity(item.quantity),
          available_after: formatQuantity(pick.availableAfter)
        });
      }

      lockTargets.sort((a, b) => {
        const wh = a.warehouseId.localeCompare(b.warehouseId);
        return wh !== 0 ? wh : a.variantId.localeCompare(b.variantId);
      });

      for (const target of lockTargets) {
        const balance = this.getOrCreateBalance(args.tenantId, target.warehouseId, target.variantId);
        const available = availableToSell({
          onHand: balance.onHand,
          reserved: balance.reserved,
          blocked: balance.blocked,
          damaged: balance.damaged,
          safetyStock: balance.safetyStock
        });
        if (available < target.quantity) {
          throw new InventoryError("Insufficient available stock.", "INVENTORY_INSUFFICIENT");
        }
        balance.reserved += target.quantity;
        balance.version += 1;
        balance.updatedAt = new Date().toISOString();
      }

      const now = new Date().toISOString();
      const row: ReservationRow = {
        id: args.reservationId,
        tenantId: args.tenantId,
        ownerType: args.ownerType,
        ownerId: args.ownerId,
        status: "active",
        expiresAt: args.expiresAt,
        version: 1,
        createdAt: now,
        updatedAt: now,
        allocations
      };
      this.reservationMap(args.tenantId).set(row.id, row);
      return this.toReservationRecord(row);
    });
  }

  async getReservation(args: {
    readonly tenantId: string;
    readonly reservationId: string;
  }): Promise<ReservationRecord | null> {
    const row = this.reservationMap(args.tenantId).get(args.reservationId);
    return row ? this.toReservationRecord(row) : null;
  }

  private releaseReservedQuantities(
    tenantId: string,
    allocations: readonly ReservationAllocation[]
  ): void {
    const sorted = [...allocations].sort((a, b) => {
      const wh = a.warehouse_id.localeCompare(b.warehouse_id);
      return wh !== 0 ? wh : a.variant_id.localeCompare(b.variant_id);
    });
    for (const alloc of sorted) {
      const balance = this.getOrCreateBalance(tenantId, alloc.warehouse_id, alloc.variant_id);
      const qty = Number(alloc.quantity);
      balance.reserved = Math.max(0, balance.reserved - qty);
      balance.version += 1;
      balance.updatedAt = new Date().toISOString();
    }
  }

  async releaseReservation(args: {
    readonly tenantId: string;
    readonly reservationId: string;
    readonly actorId: string;
    readonly idempotencyKey: string;
    readonly reason: string | null;
  }): Promise<ReservationRecord> {
    return this.withTenantLock(args.tenantId, async () => {
      const row = this.reservationMap(args.tenantId).get(args.reservationId);
      if (!row) {
        throw new InventoryError("Reservation not found.", "RESOURCE_NOT_FOUND");
      }
      if (row.status === "released") {
        return this.toReservationRecord(row);
      }
      if (row.status !== "active") {
        throw new InventoryError("Reservation is not active.", "INVENTORY_RESERVATION_STATE_INVALID");
      }
      this.releaseReservedQuantities(args.tenantId, row.allocations);
      row.status = "released";
      row.version += 1;
      row.updatedAt = new Date().toISOString();
      return this.toReservationRecord(row);
    });
  }

  async extendReservation(args: {
    readonly tenantId: string;
    readonly reservationId: string;
    readonly expiresAt: string;
    readonly expectedVersion: number;
    readonly actorId: string;
    readonly idempotencyKey: string;
  }): Promise<ReservationRecord> {
    return this.withTenantLock(args.tenantId, async () => {
      const row = this.reservationMap(args.tenantId).get(args.reservationId);
      if (!row) {
        throw new InventoryError("Reservation not found.", "RESOURCE_NOT_FOUND");
      }
      if (row.status !== "active") {
        throw new InventoryError("Reservation is not active.", "INVENTORY_RESERVATION_STATE_INVALID");
      }
      if (row.version !== args.expectedVersion) {
        throw new InventoryError("Reservation version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      if (new Date(row.expiresAt).getTime() <= Date.now()) {
        throw new InventoryError("Reservation has expired.", "INVENTORY_RESERVATION_EXPIRED");
      }
      row.expiresAt = args.expiresAt;
      row.version += 1;
      row.updatedAt = new Date().toISOString();
      return this.toReservationRecord(row);
    });
  }

  async convertReservation(args: {
    readonly tenantId: string;
    readonly reservationId: string;
    readonly ownerId: string;
    readonly actorId: string;
    readonly idempotencyKey: string;
  }): Promise<ReservationRecord> {
    return this.withTenantLock(args.tenantId, async () => {
      const row = this.reservationMap(args.tenantId).get(args.reservationId);
      if (!row) {
        throw new InventoryError("Reservation not found.", "RESOURCE_NOT_FOUND");
      }
      if (row.status === "converted") {
        return this.toReservationRecord(row);
      }
      if (row.status !== "active") {
        throw new InventoryError("Reservation is not active.", "INVENTORY_RESERVATION_STATE_INVALID");
      }
      if (row.ownerId !== args.ownerId) {
        throw new InventoryError("Reservation owner mismatch.", "INVENTORY_RESERVATION_OWNER_MISMATCH");
      }
      if (new Date(row.expiresAt).getTime() <= Date.now()) {
        throw new InventoryError("Reservation has expired.", "INVENTORY_RESERVATION_EXPIRED");
      }

      const sorted = [...row.allocations].sort((a, b) => {
        const wh = a.warehouse_id.localeCompare(b.warehouse_id);
        return wh !== 0 ? wh : a.variant_id.localeCompare(b.variant_id);
      });

      for (const alloc of sorted) {
        const balance = this.getOrCreateBalance(args.tenantId, alloc.warehouse_id, alloc.variant_id);
        const qty = Number(alloc.quantity);
        balance.reserved = Math.max(0, balance.reserved - qty);
        const before = balance.onHand;
        const after = before - qty;
        if (after < 0) {
          throw new InventoryError("Insufficient on-hand quantity.", "INVENTORY_INSUFFICIENT");
        }
        balance.onHand = after;
        balance.version += 1;
        balance.updatedAt = new Date().toISOString();
        this.appendMovement({
          tenantId: args.tenantId,
          warehouseId: alloc.warehouse_id,
          variantId: alloc.variant_id,
          movementType: "sale",
          quantityDelta: -qty,
          beforeOnHand: before,
          afterOnHand: after,
          actorId: args.actorId,
          reason: "reservation_convert",
          referenceType: "reservation",
          referenceId: row.id,
          adjustmentId: null,
          reservationId: row.id,
          idempotencyKey: args.idempotencyKey
        });
      }

      row.status = "converted";
      row.version += 1;
      row.updatedAt = new Date().toISOString();
      return this.toReservationRecord(row);
    });
  }

  async expireReservations(args: {
    readonly tenantId: string;
    readonly asOf: string;
    readonly actorId: string;
  }): Promise<readonly ReservationRecord[]> {
    return this.withTenantLock(args.tenantId, async () => {
      const asOfMs = Date.parse(args.asOf);
      const expired: ReservationRecord[] = [];
      for (const row of this.reservationMap(args.tenantId).values()) {
        if (row.status !== "active") continue;
        if (Date.parse(row.expiresAt) > asOfMs) continue;
        this.releaseReservedQuantities(args.tenantId, row.allocations);
        row.status = "expired";
        row.version += 1;
        row.updatedAt = new Date().toISOString();
        expired.push(this.toReservationRecord(row));
      }
      return expired;
    });
  }

  async detectReconciliationDiscrepancies(args: {
    readonly tenantId: string;
    readonly warehouseId: string;
  }): Promise<readonly ReconciliationDiscrepancy[]> {
    this.ensureWarehouse(args.tenantId, args.warehouseId);
    const discrepancies: ReconciliationDiscrepancy[] = [];
    const ledgerTotals = new Map<string, number>();

    for (const movement of this.movementList(args.tenantId)) {
      if (movement.warehouse_id !== args.warehouseId) continue;
      const key = movement.variant_id;
      ledgerTotals.set(key, (ledgerTotals.get(key) ?? 0) + Number(movement.quantity_delta));
    }

    const seenVariants = new Set<string>();
    for (const balance of this.balanceMap(args.tenantId).values()) {
      if (balance.warehouseId !== args.warehouseId) continue;
      seenVariants.add(balance.variantId);
      const ledgerOnHand = ledgerTotals.get(balance.variantId) ?? 0;
      if (Math.abs(balance.onHand - ledgerOnHand) > 0.000001) {
        discrepancies.push({
          warehouse_id: args.warehouseId,
          variant_id: balance.variantId,
          balance_on_hand: formatQuantity(balance.onHand),
          ledger_on_hand: formatQuantity(ledgerOnHand),
          delta: formatQuantity(balance.onHand - ledgerOnHand)
        });
      }
    }

    for (const [variantId, ledgerOnHand] of ledgerTotals) {
      if (seenVariants.has(variantId)) continue;
      if (Math.abs(ledgerOnHand) > 0.000001) {
        discrepancies.push({
          warehouse_id: args.warehouseId,
          variant_id: variantId,
          balance_on_hand: formatQuantity(0),
          ledger_on_hand: formatQuantity(ledgerOnHand),
          delta: formatQuantity(-ledgerOnHand)
        });
      }
    }

    return discrepancies;
  }

  async createReconciliationJob(args: {
    readonly tenantId: string;
    readonly jobId: UuidV7;
    readonly warehouseId: string;
    readonly idempotencyKey: string;
  }): Promise<ReconciliationJobRecord> {
    const discrepancies = await this.detectReconciliationDiscrepancies({
      tenantId: args.tenantId,
      warehouseId: args.warehouseId
    });
    const job: ReconciliationJobRecord = {
      id: args.jobId,
      tenant_id: args.tenantId,
      warehouse_id: args.warehouseId,
      status: "completed",
      discrepancies,
      created_at: new Date().toISOString()
    };
    this.reconciliationMap(args.tenantId).set(job.id, job);
    return job;
  }

  async getReconciliationJob(args: {
    readonly tenantId: string;
    readonly jobId: string;
  }): Promise<ReconciliationJobRecord | null> {
    return this.reconciliationMap(args.tenantId).get(args.jobId) ?? null;
  }

  async getIdempotentWarehouse(tenantId: string, key: string): Promise<WarehouseRecord | null> {
    return this.warehouseIdempotency.get(`${tenantId}:${key}`) ?? null;
  }

  async rememberIdempotentWarehouse(
    tenantId: string,
    key: string,
    warehouse: WarehouseRecord
  ): Promise<void> {
    this.warehouseIdempotency.set(`${tenantId}:${key}`, warehouse);
  }

  async getIdempotentAdjustment(tenantId: string, key: string): Promise<AdjustmentRecord | null> {
    return this.adjustmentIdempotency.get(`${tenantId}:${key}`) ?? null;
  }

  async rememberIdempotentAdjustment(
    tenantId: string,
    key: string,
    adjustment: AdjustmentRecord
  ): Promise<void> {
    this.adjustmentIdempotency.set(`${tenantId}:${key}`, adjustment);
  }

  async getIdempotentReservation(tenantId: string, key: string): Promise<ReservationRecord | null> {
    return this.reservationIdempotency.get(`${tenantId}:${key}`) ?? null;
  }

  async rememberIdempotentReservation(
    tenantId: string,
    key: string,
    reservation: ReservationRecord
  ): Promise<void> {
    this.reservationIdempotency.set(`${tenantId}:${key}`, reservation);
  }

  async getIdempotentReservationCommand(
    tenantId: string,
    key: string
  ): Promise<ReservationRecord | null> {
    return this.reservationCommandIdempotency.get(`${tenantId}:${key}`) ?? null;
  }

  async rememberIdempotentReservationCommand(
    tenantId: string,
    key: string,
    reservation: ReservationRecord
  ): Promise<void> {
    this.reservationCommandIdempotency.set(`${tenantId}:${key}`, reservation);
  }

  async getIdempotentReconciliation(
    tenantId: string,
    key: string
  ): Promise<ReconciliationJobRecord | null> {
    return this.reconciliationIdempotency.get(`${tenantId}:${key}`) ?? null;
  }

  async rememberIdempotentReconciliation(
    tenantId: string,
    key: string,
    job: ReconciliationJobRecord
  ): Promise<void> {
    this.reconciliationIdempotency.set(`${tenantId}:${key}`, job);
  }

  async appendAudit(record: InventoryAuditRecord): Promise<void> {
    this.auditLog.push(record);
  }
}
