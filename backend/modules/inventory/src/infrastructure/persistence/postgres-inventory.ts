import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
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
  tenant_id: string;
  warehouse_id: string;
  variant_id: string;
  on_hand: string;
  reserved: string;
  blocked: string;
  damaged: string;
  safety_stock: string;
  version: number;
  created_at: Date;
  updated_at: Date;
};

function toBalanceRecord(row: BalanceRow): BalanceRecord {
  const onHand = Number(row.on_hand);
  const reserved = Number(row.reserved);
  const blocked = Number(row.blocked);
  const damaged = Number(row.damaged);
  const safetyStock = Number(row.safety_stock);
  const available = availableToSell({
    onHand,
    reserved,
    blocked,
    damaged,
    safetyStock
  });
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    status: "active",
    version: Number(row.version),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    warehouse_id: row.warehouse_id,
    variant_id: row.variant_id,
    on_hand: formatQuantity(onHand),
    reserved: formatQuantity(reserved),
    blocked: formatQuantity(blocked),
    damaged: formatQuantity(damaged),
    safety_stock: formatQuantity(safetyStock),
    available_to_sell: formatQuantity(available)
  };
}

function toWarehouseRecord(row: {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  address: string | null;
  status: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}): WarehouseRecord {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    status: row.status,
    version: Number(row.version),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    code: row.code,
    name: row.name,
    address: row.address
  };
}

/** v1 process-local idempotency + reconciliation jobs (no DB table for jobs yet). */
export class PostgresInventoryRepository implements InventoryRepository {
  private readonly warehouseIdempotency = new Map<string, WarehouseRecord>();
  private readonly adjustmentIdempotency = new Map<string, AdjustmentRecord>();
  private readonly reservationIdempotency = new Map<string, ReservationRecord>();
  private readonly reservationCommandIdempotency = new Map<string, ReservationRecord>();
  private readonly reconciliationIdempotency = new Map<string, ReconciliationJobRecord>();
  private readonly reconciliationJobs = new Map<string, ReconciliationJobRecord>();
  readonly auditLog: InventoryAuditRecord[] = [];

  constructor(private readonly db: AppDatabase) {}

  private idemKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  async listWarehouses(tenantId: string): Promise<readonly WarehouseRecord[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const rows = await sql<{
        id: string;
        tenant_id: string;
        code: string;
        name: string;
        address: string | null;
        status: string;
        version: number;
        created_at: Date;
        updated_at: Date;
      }>`
        select id, tenant_id, code, name, address, status, version, created_at, updated_at
        from app.warehouses
        order by code
      `.execute(trx);
      return rows.rows.map(toWarehouseRecord);
    });
  }

  async createWarehouse(args: {
    readonly tenantId: string;
    readonly warehouseId: UuidV7;
    readonly code: string;
    readonly name: string;
    readonly address: string | null;
    readonly actorId: string;
  }): Promise<WarehouseRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    try {
      return await withTenantTransaction(this.db, ctx, async (trx) => {
        const inserted = await sql<{
          id: string;
          tenant_id: string;
          code: string;
          name: string;
          address: string | null;
          status: string;
          version: number;
          created_at: Date;
          updated_at: Date;
        }>`
          insert into app.warehouses (id, tenant_id, code, name, address, status)
          values (
            ${args.warehouseId}::uuid,
            ${args.tenantId}::uuid,
            ${args.code},
            ${args.name},
            ${args.address},
            'active'
          )
          returning id, tenant_id, code, name, address, status, version, created_at, updated_at
        `.execute(trx);
        return toWarehouseRecord(inserted.rows[0]!);
      });
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code: string }).code)
          : "";
      if (code === "23505") {
        throw new InventoryError("Warehouse code already exists.", "VALIDATION_FAILED");
      }
      throw error;
    }
  }

  async updateWarehouse(args: {
    readonly tenantId: string;
    readonly warehouseId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
    readonly address: string | null | undefined;
    readonly actorId: string;
  }): Promise<WarehouseRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await sql<{
        id: string;
        tenant_id: string;
        code: string;
        name: string;
        address: string | null;
        status: string;
        version: number;
        created_at: Date;
        updated_at: Date;
      }>`
        select id, tenant_id, code, name, address, status, version, created_at, updated_at
        from app.warehouses where id = ${args.warehouseId}::uuid
      `.execute(trx);
      const row = current.rows[0];
      if (!row) {
        throw new InventoryError("Warehouse not found.", "RESOURCE_NOT_FOUND");
      }
      if (Number(row.version) !== args.expectedVersion) {
        throw new InventoryError("Warehouse version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      const updated = await sql<typeof row>`
        update app.warehouses
        set name = coalesce(${args.name ?? null}, name),
            address = coalesce(${args.address ?? null}, address),
            version = version + 1,
            updated_at = now()
        where id = ${args.warehouseId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and version = ${args.expectedVersion}
        returning id, tenant_id, code, name, address, status, version, created_at, updated_at
      `.execute(trx);
      const next = updated.rows[0];
      if (!next) {
        throw new InventoryError("Warehouse version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      return toWarehouseRecord(next);
    });
  }

  async getWarehouse(args: {
    readonly tenantId: string;
    readonly warehouseId: string;
  }): Promise<WarehouseRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{
        id: string;
        tenant_id: string;
        code: string;
        name: string;
        address: string | null;
        status: string;
        version: number;
        created_at: Date;
        updated_at: Date;
      }>`
        select id, tenant_id, code, name, address, status, version, created_at, updated_at
        from app.warehouses where id = ${args.warehouseId}::uuid
      `.execute(trx);
      const row = result.rows[0];
      return row ? toWarehouseRecord(row) : null;
    });
  }

  async listBalances(tenantId: string): Promise<readonly BalanceRecord[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const rows = await sql<BalanceRow>`
        select id, tenant_id, warehouse_id, variant_id, on_hand, reserved, blocked,
               damaged, safety_stock, version, created_at, updated_at
        from app.inventory_balances
      `.execute(trx);
      return rows.rows.map(toBalanceRecord);
    });
  }

  async listMovements(tenantId: string): Promise<readonly MovementRecord[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const rows = await sql<{
        id: string;
        tenant_id: string;
        warehouse_id: string;
        variant_id: string;
        movement_type: string;
        quantity_delta: string;
        before_on_hand: string;
        after_on_hand: string;
        reference_type: string | null;
        reference_id: string | null;
        reason: string | null;
        actor_id: string;
        occurred_at: Date;
        adjustment_id: string | null;
        reservation_id: string | null;
      }>`
        select id, tenant_id, warehouse_id, variant_id, movement_type, quantity_delta,
               before_on_hand, after_on_hand, reference_type, reference_id, reason,
               actor_id, occurred_at, adjustment_id, reservation_id
        from app.inventory_movements
        order by occurred_at asc
      `.execute(trx);
      return rows.rows.map((m: {
        id: string;
        tenant_id: string;
        warehouse_id: string;
        variant_id: string;
        movement_type: string;
        quantity_delta: string;
        before_on_hand: string;
        after_on_hand: string;
        reference_type: string | null;
        reference_id: string | null;
        reason: string | null;
        actor_id: string;
        occurred_at: Date;
        adjustment_id: string | null;
        reservation_id: string | null;
      }) => ({
        id: m.id,
        tenant_id: m.tenant_id,
        warehouse_id: m.warehouse_id,
        variant_id: m.variant_id,
        movement_type: m.movement_type,
        quantity_delta: formatQuantity(Number(m.quantity_delta)),
        before_on_hand: formatQuantity(Number(m.before_on_hand)),
        after_on_hand: formatQuantity(Number(m.after_on_hand)),
        reference_type: m.reference_type,
        reference_id: m.reference_id,
        reason: m.reason,
        actor_id: m.actor_id,
        occurred_at: m.occurred_at.toISOString(),
        adjustment_id: m.adjustment_id,
        reservation_id: m.reservation_id
      }));
    });
  }

  private async getOrCreateBalance(
    trx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    warehouseId: string,
    variantId: string
  ): Promise<BalanceRow> {
    const existing = await sql<BalanceRow>`
      select id, tenant_id, warehouse_id, variant_id, on_hand, reserved, blocked,
             damaged, safety_stock, version, created_at, updated_at
      from app.inventory_balances
      where warehouse_id = ${warehouseId}::uuid and variant_id = ${variantId}::uuid
      for update
    `.execute(trx);
    if (existing.rows[0]) return existing.rows[0];

    const id = generateUuidV7();
    const inserted = await sql<BalanceRow>`
      insert into app.inventory_balances (
        id, tenant_id, warehouse_id, variant_id
      ) values (
        ${id}::uuid,
        ${tenantId}::uuid,
        ${warehouseId}::uuid,
        ${variantId}::uuid
      )
      on conflict (tenant_id, warehouse_id, variant_id) do nothing
      returning id, tenant_id, warehouse_id, variant_id, on_hand, reserved, blocked,
                damaged, safety_stock, version, created_at, updated_at
    `.execute(trx);
    if (inserted.rows[0]) return inserted.rows[0];

    const locked = await sql<BalanceRow>`
      select id, tenant_id, warehouse_id, variant_id, on_hand, reserved, blocked,
             damaged, safety_stock, version, created_at, updated_at
      from app.inventory_balances
      where warehouse_id = ${warehouseId}::uuid and variant_id = ${variantId}::uuid
      for update
    `.execute(trx);
    return locked.rows[0]!;
  }

  private async pickWarehouseForVariant(
    trx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    variantId: string,
    quantity: number,
    preferredWarehouseId: string | null,
    strategy: "preferred_only" | "preferred_then_available" | "any_available"
  ): Promise<{ warehouseId: string; availableAfter: number }> {
    const rows = await sql<{
      warehouse_id: string;
      on_hand: string;
      reserved: string;
      blocked: string;
      damaged: string;
      safety_stock: string;
    }>`
      select warehouse_id, on_hand, reserved, blocked, damaged, safety_stock
      from app.inventory_balances
      where variant_id = ${variantId}::uuid
    `.execute(trx);

    const candidates: { warehouseId: string; available: number }[] = [];
    for (const row of rows.rows) {
      const available = availableToSell({
        onHand: Number(row.on_hand),
        reserved: Number(row.reserved),
        blocked: Number(row.blocked),
        damaged: Number(row.damaged),
        safetyStock: Number(row.safety_stock)
      });
      if (available >= quantity) {
        candidates.push({ warehouseId: row.warehouse_id, available });
      }
    }

    if (preferredWarehouseId) {
      const preferred = candidates.find((c) => c.warehouseId === preferredWarehouseId);
      if (preferred) {
        return { warehouseId: preferred.warehouseId, availableAfter: preferred.available - quantity };
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

  private async loadReservation(
    trx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    reservationId: string,
    forUpdate = false
  ): Promise<{
    id: string;
    tenant_id: string;
    owner_type: "order" | "conversation" | "manual";
    owner_id: string;
    status: ReservationStatus;
    expires_at: Date;
    version: number;
    created_at: Date;
    updated_at: Date;
    allocations: ReservationAllocation[];
  } | null> {
    const lock = forUpdate ? sql`for update` : sql``;
    const res = await sql<{
      id: string;
      tenant_id: string;
      owner_type: "order" | "conversation" | "manual";
      owner_id: string;
      status: ReservationStatus;
      expires_at: Date;
      version: number;
      created_at: Date;
      updated_at: Date;
    }>`
      select id, tenant_id, owner_type, owner_id, status, expires_at, version, created_at, updated_at
      from app.inventory_reservations
      where id = ${reservationId}::uuid
      ${lock}
    `.execute(trx);
    const row = res.rows[0];
    if (!row) return null;

    const items = await sql<{
      warehouse_id: string;
      variant_id: string;
      quantity: string;
    }>`
      select warehouse_id, variant_id, quantity
      from app.inventory_reservation_items
      where reservation_id = ${reservationId}::uuid
      order by warehouse_id, variant_id
    `.execute(trx);

    const allocations: ReservationAllocation[] = [];
    for (const item of items.rows) {
      const balance = await sql<BalanceRow>`
        select on_hand, reserved, blocked, damaged, safety_stock
        from app.inventory_balances
        where warehouse_id = ${item.warehouse_id}::uuid and variant_id = ${item.variant_id}::uuid
      `.execute(trx);
      const b = balance.rows[0];
      const available = b
        ? availableToSell({
            onHand: Number(b.on_hand),
            reserved: Number(b.reserved),
            blocked: Number(b.blocked),
            damaged: Number(b.damaged),
            safetyStock: Number(b.safety_stock)
          })
        : 0;
      allocations.push({
        variant_id: item.variant_id,
        warehouse_id: item.warehouse_id,
        quantity: formatQuantity(Number(item.quantity)),
        available_after: formatQuantity(available)
      });
    }

    return { ...row, allocations };
  }

  private toReservationRecord(row: {
    id: string;
    tenant_id: string;
    owner_type: "order" | "conversation" | "manual";
    owner_id: string;
    status: ReservationStatus;
    expires_at: Date;
    version: number;
    created_at: Date;
    updated_at: Date;
    allocations: ReservationAllocation[];
  }): ReservationRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      status: row.status,
      expires_at: row.expires_at.toISOString(),
      version: Number(row.version),
      owner_type: row.owner_type,
      owner_id: row.owner_id,
      allocations: row.allocations,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString()
    };
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
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const wh = await sql<{ id: string }>`
        select id from app.warehouses where id = ${args.warehouseId}::uuid
      `.execute(trx);
      if (!wh.rows[0]) {
        throw new InventoryError("Warehouse not found.", "RESOURCE_NOT_FOUND");
      }

      const balance = await this.getOrCreateBalance(
        trx,
        args.tenantId,
        args.warehouseId,
        args.variantId
      );
      const before = Number(balance.on_hand);
      const after = before + args.quantityDelta;
      if (after < 0) {
        throw new InventoryError("Insufficient on-hand quantity.", "INVENTORY_INSUFFICIENT");
      }

      await sql`
        update app.inventory_balances
        set on_hand = ${after},
            version = version + 1,
            updated_at = now()
        where id = ${balance.id}::uuid
      `.execute(trx);

      const movementType = args.quantityDelta >= 0 ? "adjust_in" : "adjust_out";
      await sql`
        insert into app.inventory_adjustments (
          id, tenant_id, warehouse_id, variant_id, quantity_delta, reason,
          actor_id, idempotency_key
        ) values (
          ${args.adjustmentId}::uuid,
          ${args.tenantId}::uuid,
          ${args.warehouseId}::uuid,
          ${args.variantId}::uuid,
          ${args.quantityDelta},
          ${args.reason},
          ${args.actorId}::uuid,
          ${args.idempotencyKey}
        )
      `.execute(trx);

      await sql`
        insert into app.inventory_movements (
          id, tenant_id, warehouse_id, variant_id, movement_type, quantity_delta,
          before_on_hand, after_on_hand, reference_type, reference_id, reason,
          actor_id, adjustment_id, idempotency_key
        ) values (
          ${generateUuidV7()}::uuid,
          ${args.tenantId}::uuid,
          ${args.warehouseId}::uuid,
          ${args.variantId}::uuid,
          ${movementType},
          ${args.quantityDelta},
          ${before},
          ${after},
          'adjustment',
          ${args.adjustmentId}::uuid,
          ${args.reason},
          ${args.actorId}::uuid,
          ${args.adjustmentId}::uuid,
          ${args.idempotencyKey}
        )
      `.execute(trx);

      const now = new Date().toISOString();
      return {
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
    });
  }

  async getAdjustment(args: {
    readonly tenantId: string;
    readonly adjustmentId: string;
  }): Promise<AdjustmentRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{
        id: string;
        tenant_id: string;
        warehouse_id: string;
        variant_id: string;
        quantity_delta: string;
        reason: string;
        version: number;
        created_at: Date;
        updated_at: Date;
      }>`
        select id, tenant_id, warehouse_id, variant_id, quantity_delta, reason,
               version, created_at, updated_at
        from app.inventory_adjustments where id = ${args.adjustmentId}::uuid
      `.execute(trx);
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        tenant_id: row.tenant_id,
        status: "posted",
        version: Number(row.version),
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        warehouse_id: row.warehouse_id,
        variant_id: row.variant_id,
        quantity_delta: formatQuantity(Number(row.quantity_delta)),
        reason: row.reason
      };
    });
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
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
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
        const pick = await this.pickWarehouseForVariant(
          trx,
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
        const balance = await this.getOrCreateBalance(
          trx,
          args.tenantId,
          target.warehouseId,
          target.variantId
        );
        const available = availableToSell({
          onHand: Number(balance.on_hand),
          reserved: Number(balance.reserved),
          blocked: Number(balance.blocked),
          damaged: Number(balance.damaged),
          safetyStock: Number(balance.safety_stock)
        });
        if (available < target.quantity) {
          throw new InventoryError("Insufficient available stock.", "INVENTORY_INSUFFICIENT");
        }
        await sql`
          update app.inventory_balances
          set reserved = reserved + ${target.quantity},
              version = version + 1,
              updated_at = now()
          where id = ${balance.id}::uuid
        `.execute(trx);
      }

      await sql`
        insert into app.inventory_reservations (
          id, tenant_id, owner_type, owner_id, status, expires_at, idempotency_key
        ) values (
          ${args.reservationId}::uuid,
          ${args.tenantId}::uuid,
          ${args.ownerType},
          ${args.ownerId}::uuid,
          'active',
          ${args.expiresAt}::timestamptz,
          ${args.idempotencyKey}
        )
      `.execute(trx);

      for (const alloc of allocations) {
        await sql`
          insert into app.inventory_reservation_items (
            id, tenant_id, reservation_id, warehouse_id, variant_id, quantity
          ) values (
            ${generateUuidV7()}::uuid,
            ${args.tenantId}::uuid,
            ${args.reservationId}::uuid,
            ${alloc.warehouse_id}::uuid,
            ${alloc.variant_id}::uuid,
            ${Number(alloc.quantity)}
          )
        `.execute(trx);
      }

      const loaded = await this.loadReservation(trx, args.tenantId, args.reservationId);
      return this.toReservationRecord(loaded!);
    });
  }

  async getReservation(args: {
    readonly tenantId: string;
    readonly reservationId: string;
  }): Promise<ReservationRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const row = await this.loadReservation(trx, args.tenantId, args.reservationId);
      return row ? this.toReservationRecord(row) : null;
    });
  }

  private async releaseReservedQuantities(
    trx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    allocations: readonly ReservationAllocation[]
  ): Promise<void> {
    const sorted = [...allocations].sort((a, b) => {
      const wh = a.warehouse_id.localeCompare(b.warehouse_id);
      return wh !== 0 ? wh : a.variant_id.localeCompare(b.variant_id);
    });
    for (const alloc of sorted) {
      const balance = await this.getOrCreateBalance(
        trx,
        tenantId,
        alloc.warehouse_id,
        alloc.variant_id
      );
      const qty = Number(alloc.quantity);
      const newReserved = Math.max(0, Number(balance.reserved) - qty);
      await sql`
        update app.inventory_balances
        set reserved = ${newReserved},
            version = version + 1,
            updated_at = now()
        where id = ${balance.id}::uuid
      `.execute(trx);
    }
  }

  async releaseReservation(args: {
    readonly tenantId: string;
    readonly reservationId: string;
    readonly actorId: string;
    readonly idempotencyKey: string;
    readonly reason: string | null;
  }): Promise<ReservationRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const row = await this.loadReservation(trx, args.tenantId, args.reservationId, true);
      if (!row) {
        throw new InventoryError("Reservation not found.", "RESOURCE_NOT_FOUND");
      }
      if (row.status === "released") {
        return this.toReservationRecord(row);
      }
      if (row.status !== "active") {
        throw new InventoryError("Reservation is not active.", "INVENTORY_RESERVATION_STATE_INVALID");
      }
      await this.releaseReservedQuantities(trx, args.tenantId, row.allocations);
      await sql`
        update app.inventory_reservations
        set status = 'released',
            released_at = now(),
            release_reason = ${args.reason},
            version = version + 1,
            updated_at = now()
        where id = ${args.reservationId}::uuid
      `.execute(trx);
      const updated = await this.loadReservation(trx, args.tenantId, args.reservationId);
      return this.toReservationRecord(updated!);
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
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const row = await this.loadReservation(trx, args.tenantId, args.reservationId, true);
      if (!row) {
        throw new InventoryError("Reservation not found.", "RESOURCE_NOT_FOUND");
      }
      if (row.status !== "active") {
        throw new InventoryError("Reservation is not active.", "INVENTORY_RESERVATION_STATE_INVALID");
      }
      if (Number(row.version) !== args.expectedVersion) {
        throw new InventoryError("Reservation version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      if (row.expires_at.getTime() <= Date.now()) {
        throw new InventoryError("Reservation has expired.", "INVENTORY_RESERVATION_EXPIRED");
      }
      await sql`
        update app.inventory_reservations
        set expires_at = ${args.expiresAt}::timestamptz,
            version = version + 1,
            updated_at = now()
        where id = ${args.reservationId}::uuid
          and version = ${args.expectedVersion}
      `.execute(trx);
      const updated = await this.loadReservation(trx, args.tenantId, args.reservationId);
      return this.toReservationRecord(updated!);
    });
  }

  async convertReservation(args: {
    readonly tenantId: string;
    readonly reservationId: string;
    readonly ownerId: string;
    readonly actorId: string;
    readonly idempotencyKey: string;
  }): Promise<ReservationRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const row = await this.loadReservation(trx, args.tenantId, args.reservationId, true);
      if (!row) {
        throw new InventoryError("Reservation not found.", "RESOURCE_NOT_FOUND");
      }
      if (row.status === "converted") {
        return this.toReservationRecord(row);
      }
      if (row.status !== "active") {
        throw new InventoryError("Reservation is not active.", "INVENTORY_RESERVATION_STATE_INVALID");
      }
      if (row.owner_id !== args.ownerId) {
        throw new InventoryError("Reservation owner mismatch.", "INVENTORY_RESERVATION_OWNER_MISMATCH");
      }
      if (row.expires_at.getTime() <= Date.now()) {
        throw new InventoryError("Reservation has expired.", "INVENTORY_RESERVATION_EXPIRED");
      }

      const sorted = [...row.allocations].sort((a, b) => {
        const wh = a.warehouse_id.localeCompare(b.warehouse_id);
        return wh !== 0 ? wh : a.variant_id.localeCompare(b.variant_id);
      });

      for (const alloc of sorted) {
        const balance = await this.getOrCreateBalance(
          trx,
          args.tenantId,
          alloc.warehouse_id,
          alloc.variant_id
        );
        const qty = Number(alloc.quantity);
        const before = Number(balance.on_hand);
        const newReserved = Math.max(0, Number(balance.reserved) - qty);
        const after = before - qty;
        if (after < 0) {
          throw new InventoryError("Insufficient on-hand quantity.", "INVENTORY_INSUFFICIENT");
        }
        await sql`
          update app.inventory_balances
          set reserved = ${newReserved},
              on_hand = ${after},
              version = version + 1,
              updated_at = now()
          where id = ${balance.id}::uuid
        `.execute(trx);
        await sql`
          insert into app.inventory_movements (
            id, tenant_id, warehouse_id, variant_id, movement_type, quantity_delta,
            before_on_hand, after_on_hand, reference_type, reference_id, reason,
            actor_id, reservation_id, idempotency_key
          ) values (
            ${generateUuidV7()}::uuid,
            ${args.tenantId}::uuid,
            ${alloc.warehouse_id}::uuid,
            ${alloc.variant_id}::uuid,
            'sale',
            ${-qty},
            ${before},
            ${after},
            'reservation',
            ${row.id}::uuid,
            'reservation_convert',
            ${args.actorId}::uuid,
            ${row.id}::uuid,
            ${args.idempotencyKey}
          )
        `.execute(trx);
      }

      await sql`
        update app.inventory_reservations
        set status = 'converted',
            converted_at = now(),
            version = version + 1,
            updated_at = now()
        where id = ${args.reservationId}::uuid
      `.execute(trx);
      const updated = await this.loadReservation(trx, args.tenantId, args.reservationId);
      return this.toReservationRecord(updated!);
    });
  }

  async expireReservations(args: {
    readonly tenantId: string;
    readonly asOf: string;
    readonly actorId: string;
  }): Promise<readonly ReservationRecord[]> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const asOfMs = Date.parse(args.asOf);
      const active = await sql<{ id: string }>`
        select id from app.inventory_reservations
        where status = 'active' and expires_at <= ${args.asOf}::timestamptz
        for update
      `.execute(trx);

      const expired: ReservationRecord[] = [];
      for (const { id } of active.rows) {
        const row = await this.loadReservation(trx, args.tenantId, id, true);
        if (!row || row.status !== "active") continue;
        if (Date.parse(row.expires_at.toISOString()) > asOfMs) continue;
        await this.releaseReservedQuantities(trx, args.tenantId, row.allocations);
        await sql`
          update app.inventory_reservations
          set status = 'expired', version = version + 1, updated_at = now()
          where id = ${id}::uuid
        `.execute(trx);
        const updated = await this.loadReservation(trx, args.tenantId, id);
        if (updated) expired.push(this.toReservationRecord(updated));
      }
      return expired;
    });
  }

  async detectReconciliationDiscrepancies(args: {
    readonly tenantId: string;
    readonly warehouseId: string;
  }): Promise<readonly ReconciliationDiscrepancy[]> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const wh = await sql<{ id: string }>`
        select id from app.warehouses where id = ${args.warehouseId}::uuid
      `.execute(trx);
      if (!wh.rows[0]) {
        throw new InventoryError("Warehouse not found.", "RESOURCE_NOT_FOUND");
      }

      const movements = await sql<{ variant_id: string; quantity_delta: string }>`
        select variant_id, quantity_delta
        from app.inventory_movements
        where warehouse_id = ${args.warehouseId}::uuid
      `.execute(trx);

      const ledgerTotals = new Map<string, number>();
      for (const m of movements.rows) {
        ledgerTotals.set(
          m.variant_id,
          (ledgerTotals.get(m.variant_id) ?? 0) + Number(m.quantity_delta)
        );
      }

      const balances = await sql<{ variant_id: string; on_hand: string }>`
        select variant_id, on_hand from app.inventory_balances
        where warehouse_id = ${args.warehouseId}::uuid
      `.execute(trx);

      const discrepancies: ReconciliationDiscrepancy[] = [];
      const seenVariants = new Set<string>();
      for (const balance of balances.rows) {
        seenVariants.add(balance.variant_id);
        const ledgerOnHand = ledgerTotals.get(balance.variant_id) ?? 0;
        const onHand = Number(balance.on_hand);
        if (Math.abs(onHand - ledgerOnHand) > 0.000001) {
          discrepancies.push({
            warehouse_id: args.warehouseId,
            variant_id: balance.variant_id,
            balance_on_hand: formatQuantity(onHand),
            ledger_on_hand: formatQuantity(ledgerOnHand),
            delta: formatQuantity(onHand - ledgerOnHand)
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
    });
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
    this.reconciliationJobs.set(`${args.tenantId}:${args.jobId}`, job);
    return job;
  }

  async getReconciliationJob(args: {
    readonly tenantId: string;
    readonly jobId: string;
  }): Promise<ReconciliationJobRecord | null> {
    return this.reconciliationJobs.get(`${args.tenantId}:${args.jobId}`) ?? null;
  }

  async getIdempotentWarehouse(tenantId: string, key: string): Promise<WarehouseRecord | null> {
    return this.warehouseIdempotency.get(this.idemKey(tenantId, key)) ?? null;
  }

  async rememberIdempotentWarehouse(
    tenantId: string,
    key: string,
    warehouse: WarehouseRecord
  ): Promise<void> {
    this.warehouseIdempotency.set(this.idemKey(tenantId, key), warehouse);
  }

  async getIdempotentAdjustment(tenantId: string, key: string): Promise<AdjustmentRecord | null> {
    return this.adjustmentIdempotency.get(this.idemKey(tenantId, key)) ?? null;
  }

  async rememberIdempotentAdjustment(
    tenantId: string,
    key: string,
    adjustment: AdjustmentRecord
  ): Promise<void> {
    this.adjustmentIdempotency.set(this.idemKey(tenantId, key), adjustment);
  }

  async getIdempotentReservation(tenantId: string, key: string): Promise<ReservationRecord | null> {
    return this.reservationIdempotency.get(this.idemKey(tenantId, key)) ?? null;
  }

  async rememberIdempotentReservation(
    tenantId: string,
    key: string,
    reservation: ReservationRecord
  ): Promise<void> {
    this.reservationIdempotency.set(this.idemKey(tenantId, key), reservation);
  }

  async getIdempotentReservationCommand(
    tenantId: string,
    key: string
  ): Promise<ReservationRecord | null> {
    return this.reservationCommandIdempotency.get(this.idemKey(tenantId, key)) ?? null;
  }

  async rememberIdempotentReservationCommand(
    tenantId: string,
    key: string,
    reservation: ReservationRecord
  ): Promise<void> {
    this.reservationCommandIdempotency.set(this.idemKey(tenantId, key), reservation);
  }

  async getIdempotentReconciliation(
    tenantId: string,
    key: string
  ): Promise<ReconciliationJobRecord | null> {
    return this.reconciliationIdempotency.get(this.idemKey(tenantId, key)) ?? null;
  }

  async rememberIdempotentReconciliation(
    tenantId: string,
    key: string,
    job: ReconciliationJobRecord
  ): Promise<void> {
    this.reconciliationIdempotency.set(this.idemKey(tenantId, key), job);
  }

  async appendAudit(record: InventoryAuditRecord): Promise<void> {
    this.auditLog.push(record);
  }
}
