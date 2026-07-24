export const MODULE_NAME = "order" as const;

export {
  buildOrderFingerprint,
  calculateOrderTotals,
  cancelOrder,
  confirmOrder,
  createOrderDraft,
  expireOrder,
  extractInclusiveTaxMinor,
  formatEtag,
  getOrder,
  getOrderHistory,
  listOrders,
  OrderError,
  parseIfMatchVersion,
  parseQuantity,
  recalculateOrder,
  requireOrderPermission,
  reserveOrderInventory,
  roundHalfUp,
  TAX_RATE_BPS,
  updateOrderDraft,
  type CatalogPricingPort,
  type OrderErrorCode,
  type OrderHistoryRecord,
  type OrderItemRecord,
  type OrderPermission,
  type OrderRecord,
  type OrderRepository,
  type OrderResource,
  type OrderStatus,
  type ReservationPort
} from "./application/order.js";

export { PostgresOrderRepository } from "./infrastructure/persistence/postgres-order.js";
export { createOrderController } from "./presentation/http/order.controller.js";
