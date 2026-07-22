import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import type { IdempotencyStore } from "@ai-sales/idempotency";
import { runInventoryIdempotent } from "./inventory-idempotency.js";

/**
 * BE-INV-002…008 — Inventory application layer (warehouses, balances, adjustments,
 * reservations, expiry, reconciliation). In-memory until Postgres adapter.
 * Mirrors catalog/customer style (application + in-memory repo + HTTP controller).
 */

export type InventoryPermission = "inventory.read" | "inventory.adjust" | "inventory.reserve";

export type ReservationStatus = "active" | "released" | "expired" | "converted";

export type ReservationOwnerType = "order" | "conversation" | "manual";

export type InventoryErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_VERSION_MISMATCH"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "INVENTORY_BALANCE_NOT_FOUND"
  | "INVENTORY_INSUFFICIENT"
  | "INVENTORY_RESERVATION_EXPIRED"
  | "INVENTORY_RESERVATION_STATE_INVALID"
  | "INVENTORY_RESERVATION_OWNER_MISMATCH";

export class InventoryError extends Error {
  constructor(
    message: string,
    readonly code: InventoryErrorCode
  ) {
    super(message);
    this.name = "InventoryError";
  }
}

/** Frozen OpenAPI InventoryResource (enterprise doc-freeze W1). */
export interface InventoryResource {
  readonly id: string;
  readonly tenant_id: string;
  readonly status: string;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface WarehouseRecord extends InventoryResource {
  readonly code: string;
  readonly name: string;
  readonly address: string | null;
}

export interface BalanceRecord extends InventoryResource {
  readonly warehouse_id: string;
  readonly variant_id: string;
  readonly on_hand: string;
  readonly reserved: string;
  readonly blocked: string;
  readonly damaged: string;
  readonly safety_stock: string;
  readonly available_to_sell: string;
}

export interface MovementRecord {
  readonly id: string;
  readonly tenant_id: string;
  readonly warehouse_id: string;
  readonly variant_id: string;
  readonly movement_type: string;
  readonly quantity_delta: string;
  readonly before_on_hand: string;
  readonly after_on_hand: string;
  readonly reference_type: string | null;
  readonly reference_id: string | null;
  readonly reason: string | null;
  readonly actor_id: string;
  readonly occurred_at: string;
  readonly adjustment_id: string | null;
  readonly reservation_id: string | null;
}

export interface ReservationAllocation {
  readonly variant_id: string;
  readonly warehouse_id: string;
  readonly quantity: string;
  readonly available_after: string;
}

export interface ReservationRecord {
  readonly id: string;
  readonly tenant_id: string;
  readonly status: ReservationStatus;
  readonly expires_at: string;
  readonly version: number;
  readonly owner_type: ReservationOwnerType;
  readonly owner_id: string;
  readonly allocations: readonly ReservationAllocation[];
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AdjustmentRecord extends InventoryResource {
  readonly warehouse_id: string;
  readonly variant_id: string;
  readonly quantity_delta: string;
  readonly reason: string;
}

export interface ReconciliationDiscrepancy {
  readonly warehouse_id: string;
  readonly variant_id: string;
  readonly balance_on_hand: string;
  readonly ledger_on_hand: string;
  readonly delta: string;
}

export interface ReconciliationJobRecord {
  readonly id: string;
  readonly tenant_id: string;
  readonly warehouse_id: string;
  readonly status: "completed" | "failed";
  readonly discrepancies: readonly ReconciliationDiscrepancy[];
  readonly created_at: string;
}

export interface InventoryAuditRecord {
  readonly action: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly detail: Record<string, unknown>;
  readonly at: string;
}

export interface InventoryRepository {
  listWarehouses(tenantId: string): Promise<readonly WarehouseRecord[]>;
  createWarehouse(args: {
    readonly tenantId: string;
    readonly warehouseId: UuidV7;
    readonly code: string;
    readonly name: string;
    readonly address: string | null;
    readonly actorId: string;
  }): Promise<WarehouseRecord>;
  updateWarehouse(args: {
    readonly tenantId: string;
    readonly warehouseId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
    readonly address: string | null | undefined;
    readonly actorId: string;
  }): Promise<WarehouseRecord>;
  getWarehouse(args: {
    readonly tenantId: string;
    readonly warehouseId: string;
  }): Promise<WarehouseRecord | null>;

  listBalances(tenantId: string): Promise<readonly BalanceRecord[]>;
  listMovements(tenantId: string): Promise<readonly MovementRecord[]>;

  createAdjustment(args: {
    readonly tenantId: string;
    readonly adjustmentId: UuidV7;
    readonly warehouseId: string;
    readonly variantId: string;
    readonly quantityDelta: number;
    readonly reason: string;
    readonly actorId: string;
    readonly idempotencyKey: string;
  }): Promise<AdjustmentRecord>;

  getAdjustment(args: {
    readonly tenantId: string;
    readonly adjustmentId: string;
  }): Promise<AdjustmentRecord | null>;

  createReservation(args: {
    readonly tenantId: string;
    readonly reservationId: UuidV7;
    readonly ownerType: ReservationOwnerType;
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
  }): Promise<ReservationRecord>;

  getReservation(args: {
    readonly tenantId: string;
    readonly reservationId: string;
  }): Promise<ReservationRecord | null>;

  releaseReservation(args: {
    readonly tenantId: string;
    readonly reservationId: string;
    readonly actorId: string;
    readonly idempotencyKey: string;
    readonly reason: string | null;
  }): Promise<ReservationRecord>;

  extendReservation(args: {
    readonly tenantId: string;
    readonly reservationId: string;
    readonly expiresAt: string;
    readonly expectedVersion: number;
    readonly actorId: string;
    readonly idempotencyKey: string;
  }): Promise<ReservationRecord>;

  convertReservation(args: {
    readonly tenantId: string;
    readonly reservationId: string;
    readonly ownerId: string;
    readonly actorId: string;
    readonly idempotencyKey: string;
  }): Promise<ReservationRecord>;

  expireReservations(args: {
    readonly tenantId: string;
    readonly asOf: string;
    readonly actorId: string;
  }): Promise<readonly ReservationRecord[]>;

  detectReconciliationDiscrepancies(args: {
    readonly tenantId: string;
    readonly warehouseId: string;
  }): Promise<readonly ReconciliationDiscrepancy[]>;

  createReconciliationJob(args: {
    readonly tenantId: string;
    readonly jobId: UuidV7;
    readonly warehouseId: string;
    readonly idempotencyKey: string;
  }): Promise<ReconciliationJobRecord>;

  getReconciliationJob(args: {
    readonly tenantId: string;
    readonly jobId: string;
  }): Promise<ReconciliationJobRecord | null>;

  getIdempotentWarehouse(tenantId: string, key: string): Promise<WarehouseRecord | null>;
  rememberIdempotentWarehouse(tenantId: string, key: string, warehouse: WarehouseRecord): Promise<void>;

  getIdempotentAdjustment(tenantId: string, key: string): Promise<AdjustmentRecord | null>;
  rememberIdempotentAdjustment(tenantId: string, key: string, adjustment: AdjustmentRecord): Promise<void>;

  getIdempotentReservation(tenantId: string, key: string): Promise<ReservationRecord | null>;
  rememberIdempotentReservation(tenantId: string, key: string, reservation: ReservationRecord): Promise<void>;

  getIdempotentReservationCommand(
    tenantId: string,
    key: string
  ): Promise<ReservationRecord | null>;
  rememberIdempotentReservationCommand(
    tenantId: string,
    key: string,
    reservation: ReservationRecord
  ): Promise<void>;

  getIdempotentReconciliation(tenantId: string, key: string): Promise<ReconciliationJobRecord | null>;
  rememberIdempotentReconciliation(
    tenantId: string,
    key: string,
    job: ReconciliationJobRecord
  ): Promise<void>;

  appendAudit(record: InventoryAuditRecord): Promise<void>;
}

export function requireInventoryPermission(
  actorPermissions: readonly string[],
  permission: InventoryPermission
): void {
  if (!actorPermissions.includes(permission)) {
    throw new InventoryError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) {
    throw new InventoryError("Invalid quantity.", "VALIDATION_FAILED");
  }
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return String(rounded);
}

export function parseQuantity(value: string | undefined | null): number {
  if (value == null || !value.trim()) {
    throw new InventoryError("Quantity is required.", "VALIDATION_FAILED");
  }
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new InventoryError("Invalid quantity format.", "VALIDATION_FAILED");
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    throw new InventoryError("Invalid quantity.", "VALIDATION_FAILED");
  }
  return num;
}

export function availableToSell(args: {
  readonly onHand: number;
  readonly reserved: number;
  readonly blocked: number;
  readonly damaged: number;
  readonly safetyStock: number;
}): number {
  return Math.max(
    0,
    args.onHand - args.reserved - args.blocked - args.damaged - args.safetyStock
  );
}

export function parseIfMatchVersion(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^"?v(\d+)"?$/.exec(value.trim());
  return match?.[1] ? Number(match[1]) : null;
}

export function formatEtag(version: number): string {
  return `"v${version}"`;
}

function emptyPage() {
  return { next_cursor: null as null, has_more: false as const };
}

function toWarehouseResponse(warehouse: WarehouseRecord): Record<string, unknown> {
  return {
    id: warehouse.id,
    tenant_id: warehouse.tenant_id,
    status: warehouse.status,
    version: warehouse.version,
    created_at: warehouse.created_at,
    updated_at: warehouse.updated_at,
    code: warehouse.code,
    name: warehouse.name,
    address: warehouse.address
  };
}

function toBalanceResponse(balance: BalanceRecord): Record<string, unknown> {
  return {
    id: balance.id,
    tenant_id: balance.tenant_id,
    status: balance.status,
    version: balance.version,
    created_at: balance.created_at,
    updated_at: balance.updated_at,
    warehouse_id: balance.warehouse_id,
    variant_id: balance.variant_id,
    on_hand: balance.on_hand,
    reserved: balance.reserved,
    blocked: balance.blocked,
    damaged: balance.damaged,
    safety_stock: balance.safety_stock,
    available_to_sell: balance.available_to_sell
  };
}

function toAdjustmentResponse(adjustment: AdjustmentRecord): Record<string, unknown> {
  return {
    id: adjustment.id,
    tenant_id: adjustment.tenant_id,
    status: adjustment.status,
    version: adjustment.version,
    created_at: adjustment.created_at,
    updated_at: adjustment.updated_at,
    warehouse_id: adjustment.warehouse_id,
    variant_id: adjustment.variant_id,
    quantity_delta: adjustment.quantity_delta,
    reason: adjustment.reason
  };
}

function toReservationResponse(reservation: ReservationRecord): Record<string, unknown> {
  return {
    id: reservation.id,
    status: reservation.status,
    expires_at: reservation.expires_at,
    version: reservation.version,
    allocations: reservation.allocations.map((a) => ({
      variant_id: a.variant_id,
      warehouse_id: a.warehouse_id,
      quantity: a.quantity,
      available_after: a.available_after
    }))
  };
}

export async function listWarehouses(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.read");
  const rows = await options.repo.listWarehouses(options.tenantId);
  return {
    data: rows.map(toWarehouseResponse),
    page_info: emptyPage(),
    meta: {}
  };
}

export async function createWarehouse(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
  readonly name: string;
  readonly code: string;
  readonly address?: string | null;
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.adjust");
  if (!options.idempotencyKey?.trim()) {
    throw new InventoryError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const warehouse = await runInventoryIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "inventory.warehouse.create",
    key,
    loadCached: () => options.repo.getIdempotentWarehouse(options.tenantId, key),
    rememberCached: (row) => options.repo.rememberIdempotentWarehouse(options.tenantId, key, row),
    execute: async () => {
      const name = options.name?.trim();
      const code = options.code?.trim();
      if (!name || !code) {
        throw new InventoryError("name and code are required.", "VALIDATION_FAILED");
      }
      const created = await options.repo.createWarehouse({
        tenantId: options.tenantId,
        warehouseId: generateUuidV7(),
        code,
        name,
        address: options.address?.trim() ?? null,
        actorId: options.actorId
      });
      await options.repo.appendAudit({
        action: "inventory.warehouse.created",
        tenantId: options.tenantId,
        actorId: options.actorId,
        detail: { warehouse_id: created.id, code: created.code },
        at: new Date().toISOString()
      });
      return created;
    },
    resourceId: (row) => row.id,
    loadByResourceId: (id) =>
      options.repo.getWarehouse({ tenantId: options.tenantId, warehouseId: id })
  });
  return { data: toWarehouseResponse(warehouse), meta: {}, version: warehouse.version };
}

export async function updateWarehouse(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly warehouseId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly expectedVersion: number;
  readonly name?: string | null;
  readonly address?: string | null;
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.adjust");
  const warehouse = await options.repo.updateWarehouse({
    tenantId: options.tenantId,
    warehouseId: options.warehouseId,
    expectedVersion: options.expectedVersion,
    name: options.name,
    address: options.address,
    actorId: options.actorId
  });
  return { data: toWarehouseResponse(warehouse), meta: {}, version: warehouse.version };
}

export async function listBalances(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.read");
  const rows = await options.repo.listBalances(options.tenantId);
  return {
    data: rows.map(toBalanceResponse),
    page_info: emptyPage(),
    meta: {}
  };
}

export async function listMovements(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.read");
  const rows = await options.repo.listMovements(options.tenantId);
  return {
    data: rows.map((m) => ({
      id: m.id,
      tenant_id: m.tenant_id,
      status: "posted",
      version: 1,
      created_at: m.occurred_at,
      updated_at: m.occurred_at,
      warehouse_id: m.warehouse_id,
      variant_id: m.variant_id,
      movement_type: m.movement_type,
      quantity_delta: m.quantity_delta,
      before_on_hand: m.before_on_hand,
      after_on_hand: m.after_on_hand,
      reason: m.reason
    })),
    page_info: emptyPage(),
    meta: {}
  };
}

export async function createInventoryAdjustment(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
  readonly warehouseId: string;
  readonly variantId: string;
  readonly quantityDelta: string;
  readonly reason: string;
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.adjust");
  if (!options.idempotencyKey?.trim()) {
    throw new InventoryError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const adjustment = await runInventoryIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "inventory.adjustment.create",
    key,
    loadCached: () => options.repo.getIdempotentAdjustment(options.tenantId, key),
    rememberCached: (row) => options.repo.rememberIdempotentAdjustment(options.tenantId, key, row),
    execute: async () => {
      const delta = parseQuantity(options.quantityDelta);
      const reason = options.reason?.trim();
      if (!reason) {
        throw new InventoryError("reason is required.", "VALIDATION_FAILED");
      }
      const created = await options.repo.createAdjustment({
        tenantId: options.tenantId,
        adjustmentId: generateUuidV7(),
        warehouseId: options.warehouseId,
        variantId: options.variantId,
        quantityDelta: delta,
        reason,
        actorId: options.actorId,
        idempotencyKey: key
      });
      await options.repo.appendAudit({
        action: "inventory.adjusted",
        tenantId: options.tenantId,
        actorId: options.actorId,
        detail: {
          adjustment_id: created.id,
          warehouse_id: created.warehouse_id,
          variant_id: created.variant_id,
          quantity_delta: created.quantity_delta
        },
        at: new Date().toISOString()
      });
      return created;
    },
    resourceId: (row) => row.id,
    loadByResourceId: (id) =>
      options.repo.getAdjustment({ tenantId: options.tenantId, adjustmentId: id })
  });
  return { data: toAdjustmentResponse(adjustment), meta: {}, version: adjustment.version };
}

export async function getInventoryAdjustment(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly adjustmentId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.read");
  const row = await options.repo.getAdjustment({
    tenantId: options.tenantId,
    adjustmentId: options.adjustmentId
  });
  if (!row) {
    throw new InventoryError("Adjustment not found.", "RESOURCE_NOT_FOUND");
  }
  return { data: toAdjustmentResponse(row), meta: {}, version: row.version };
}

export async function createInventoryReservation(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
  readonly ownerType: ReservationOwnerType;
  readonly ownerId: string;
  readonly expiresAt: string;
  readonly allocationStrategy?: "preferred_only" | "preferred_then_available" | "any_available";
  readonly items: readonly {
    readonly variant_id: string;
    readonly quantity: string;
    readonly preferred_warehouse_id?: string | null;
  }[];
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.reserve");
  if (!options.idempotencyKey?.trim()) {
    throw new InventoryError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const reservation = await runInventoryIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "inventory.reservation.create",
    key,
    loadCached: () => options.repo.getIdempotentReservation(options.tenantId, key),
    rememberCached: (row) => options.repo.rememberIdempotentReservation(options.tenantId, key, row),
    execute: async () => {
      if (!options.items?.length) {
        throw new InventoryError("items are required.", "VALIDATION_FAILED");
      }
      const expiresAt = options.expiresAt?.trim();
      if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
        throw new InventoryError("expires_at is invalid.", "VALIDATION_FAILED");
      }
      const created = await options.repo.createReservation({
        tenantId: options.tenantId,
        reservationId: generateUuidV7(),
        ownerType: options.ownerType,
        ownerId: options.ownerId,
        expiresAt,
        allocationStrategy: options.allocationStrategy ?? "preferred_then_available",
        items: options.items.map((item) => ({
          variantId: item.variant_id,
          quantity: parseQuantity(item.quantity),
          preferredWarehouseId: item.preferred_warehouse_id ?? null
        })),
        actorId: options.actorId,
        idempotencyKey: key
      });
      await options.repo.appendAudit({
        action: "inventory.reserved",
        tenantId: options.tenantId,
        actorId: options.actorId,
        detail: { reservation_id: created.id, owner_id: created.owner_id },
        at: new Date().toISOString()
      });
      return created;
    },
    resourceId: (row) => row.id,
    loadByResourceId: (id) =>
      options.repo.getReservation({ tenantId: options.tenantId, reservationId: id })
  });
  return { data: toReservationResponse(reservation), meta: {} };
}

export async function getInventoryReservation(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly reservationId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.read");
  const row = await options.repo.getReservation({
    tenantId: options.tenantId,
    reservationId: options.reservationId
  });
  if (!row) {
    throw new InventoryError("Reservation not found.", "RESOURCE_NOT_FOUND");
  }
  return { data: toReservationResponse(row), meta: {} };
}

export async function releaseInventoryReservation(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly reservationId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.reserve");
  if (!options.idempotencyKey?.trim()) {
    throw new InventoryError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const reservation = await runInventoryIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "inventory.reservation.release",
    key,
    loadCached: () => options.repo.getIdempotentReservationCommand(options.tenantId, key),
    rememberCached: (row) =>
      options.repo.rememberIdempotentReservationCommand(options.tenantId, key, row),
    execute: () =>
      options.repo.releaseReservation({
        tenantId: options.tenantId,
        reservationId: options.reservationId,
        actorId: options.actorId,
        idempotencyKey: key,
        reason: "manual_release"
      }),
    resourceId: (row) => row.id,
    loadByResourceId: (id) =>
      options.repo.getReservation({ tenantId: options.tenantId, reservationId: id })
  });
  return { data: toReservationResponse(reservation), meta: {} };
}

export async function extendInventoryReservation(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly reservationId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
  readonly expiresAt: string;
  readonly expectedVersion: number;
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.reserve");
  if (!options.idempotencyKey?.trim()) {
    throw new InventoryError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const reservation = await runInventoryIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "inventory.reservation.extend",
    key,
    loadCached: () => options.repo.getIdempotentReservationCommand(options.tenantId, key),
    rememberCached: (row) =>
      options.repo.rememberIdempotentReservationCommand(options.tenantId, key, row),
    execute: async () => {
      const expiresAt = options.expiresAt?.trim();
      if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
        throw new InventoryError("expires_at is invalid.", "VALIDATION_FAILED");
      }
      return options.repo.extendReservation({
        tenantId: options.tenantId,
        reservationId: options.reservationId,
        expiresAt,
        expectedVersion: options.expectedVersion,
        actorId: options.actorId,
        idempotencyKey: key
      });
    },
    resourceId: (row) => row.id,
    loadByResourceId: (id) =>
      options.repo.getReservation({ tenantId: options.tenantId, reservationId: id })
  });
  return { data: toReservationResponse(reservation), meta: {} };
}

export async function convertInventoryReservation(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly reservationId: string;
  readonly ownerId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
}) {
  if (
    !options.actorPermissions.includes("inventory.reserve") &&
    !options.actorPermissions.includes("internal.order.confirm")
  ) {
    throw new InventoryError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
  if (!options.idempotencyKey?.trim()) {
    throw new InventoryError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const reservation = await runInventoryIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "inventory.reservation.convert",
    key,
    loadCached: () => options.repo.getIdempotentReservationCommand(options.tenantId, key),
    rememberCached: (row) =>
      options.repo.rememberIdempotentReservationCommand(options.tenantId, key, row),
    execute: () =>
      options.repo.convertReservation({
        tenantId: options.tenantId,
        reservationId: options.reservationId,
        ownerId: options.ownerId,
        actorId: options.actorId,
        idempotencyKey: key
      }),
    resourceId: (row) => row.id,
    loadByResourceId: (id) =>
      options.repo.getReservation({ tenantId: options.tenantId, reservationId: id })
  });
  return { data: toReservationResponse(reservation), meta: {} };
}

export async function expireInventoryReservations(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly asOf?: string;
}) {
  const asOf = options.asOf ?? new Date().toISOString();
  return options.repo.expireReservations({
    tenantId: options.tenantId,
    asOf,
    actorId: options.actorId
  });
}

export async function createInventoryReconciliation(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
  readonly warehouseId: string;
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.adjust");
  if (!options.idempotencyKey?.trim()) {
    throw new InventoryError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const job = await runInventoryIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "inventory.reconciliation.create",
    key,
    loadCached: () => options.repo.getIdempotentReconciliation(options.tenantId, key),
    rememberCached: (row) =>
      options.repo.rememberIdempotentReconciliation(options.tenantId, key, row),
    execute: () =>
      options.repo.createReconciliationJob({
        tenantId: options.tenantId,
        jobId: generateUuidV7(),
        warehouseId: options.warehouseId,
        idempotencyKey: key
      }),
    resourceId: (row) => row.id,
    loadByResourceId: (id) =>
      options.repo.getReconciliationJob({ tenantId: options.tenantId, jobId: id })
  });
  return {
    data: {
      id: job.id,
      status: job.status,
      warehouse_id: job.warehouse_id,
      discrepancies: job.discrepancies
    },
    meta: {}
  };
}

export async function getInventoryReconciliation(options: {
  readonly repo: InventoryRepository;
  readonly tenantId: string;
  readonly jobId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireInventoryPermission(options.actorPermissions, "inventory.read");
  const job = await options.repo.getReconciliationJob({
    tenantId: options.tenantId,
    jobId: options.jobId
  });
  if (!job) {
    throw new InventoryError("Reconciliation job not found.", "RESOURCE_NOT_FOUND");
  }
  return {
    data: {
      id: job.id,
      status: job.status,
      warehouse_id: job.warehouse_id,
      discrepancies: job.discrepancies
    },
    meta: {}
  };
}
