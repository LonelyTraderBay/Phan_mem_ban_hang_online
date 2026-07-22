export const MODULE_NAME = "inventory" as const;

export {
  availableToSell,
  convertInventoryReservation,
  createInventoryAdjustment,
  createInventoryReconciliation,
  createInventoryReservation,
  createWarehouse,
  expireInventoryReservations,
  extendInventoryReservation,
  formatEtag,
  formatQuantity,
  getInventoryAdjustment,
  getInventoryReconciliation,
  getInventoryReservation,
  InventoryError,
  listBalances,
  listMovements,
  listWarehouses,
  parseIfMatchVersion,
  parseQuantity,
  releaseInventoryReservation,
  requireInventoryPermission,
  updateWarehouse,
  type AdjustmentRecord,
  type BalanceRecord,
  type InventoryAuditRecord,
  type InventoryErrorCode,
  type InventoryPermission,
  type InventoryRepository,
  type InventoryResource,
  type MovementRecord,
  type ReconciliationDiscrepancy,
  type ReconciliationJobRecord,
  type ReservationAllocation,
  type ReservationOwnerType,
  type ReservationRecord,
  type ReservationStatus,
  type WarehouseRecord
} from "./application/inventory.js";

export { InMemoryInventoryRepository } from "./infrastructure/persistence/in-memory-inventory.js";
export { createInventoryController } from "./presentation/http/inventory.controller.js";
