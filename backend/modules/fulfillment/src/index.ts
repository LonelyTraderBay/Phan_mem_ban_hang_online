export const MODULE_NAME = "fulfillment" as const;

export {
  approveReturn,
  completeReturn,
  createPackingSlipJob,
  createReturn,
  createShipment,
  FulfillmentError,
  markShipmentDelivered,
  markShipmentPacked,
  markShipmentShipped,
  receiveReturn,
  requireFulfillmentPermission,
  updateShipment,
  type FulfillmentErrorCode,
  type FulfillmentPermission,
  type FulfillmentRepository,
  type InventoryRestockPort,
  type OrderEligibilityPort,
  type ReturnRecord,
  type ReturnResource,
  type ReturnStatus,
  type ShipmentRecord,
  type ShipmentResource,
  type ShipmentStatus
} from "./application/fulfillment.js";

export { InMemoryFulfillmentRepository } from "./infrastructure/persistence/in-memory-fulfillment.js";
export { PostgresFulfillmentRepository } from "./infrastructure/persistence/postgres-fulfillment.js";
export { createFulfillmentController } from "./presentation/http/fulfillment.controller.js";
