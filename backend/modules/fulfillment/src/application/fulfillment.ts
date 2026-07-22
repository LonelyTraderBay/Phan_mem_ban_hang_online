import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";

/**
 * BE-FUL-001…002 + BE-RET-001 — Fulfillment/returns application layer (in-memory stub).
 */

export type FulfillmentPermission = "shipment.read" | "shipment.manage" | "packing_slip.print";

export type ShipmentStatus = "pending" | "packed" | "shipped" | "delivered" | "cancelled";
export type ReturnStatus = "requested" | "approved" | "received" | "completed" | "rejected";

export type FulfillmentErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_VERSION_MISMATCH"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "ORDER_STATE_INVALID"
  | "RETURN_STATE_INVALID";

export class FulfillmentError extends Error {
  constructor(
    message: string,
    readonly code: FulfillmentErrorCode
  ) {
    super(message);
    this.name = "FulfillmentError";
  }
}

export interface ShipmentResource {
  readonly id: string;
  readonly tenant_id: string;
  readonly order_id: string;
  readonly status: ShipmentStatus;
  readonly carrier: string | null;
  readonly tracking_code: string | null;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ReturnResource {
  readonly id: string;
  readonly tenant_id: string;
  readonly order_id: string;
  readonly status: ReturnStatus;
  readonly reason: string | null;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ShipmentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly orderId: string;
  readonly status: ShipmentStatus;
  readonly carrier: string | null;
  readonly trackingCode: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly items: readonly { readonly orderItemId: string; readonly quantity: string }[];
}

export interface ReturnRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly orderId: string;
  readonly status: ReturnStatus;
  readonly reason: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly items: readonly { readonly orderItemId: string; readonly quantity: string; readonly restocked: boolean }[];
}

export interface OrderEligibilityPort {
  isOrderConfirmed(args: {
    readonly tenantId: string;
    readonly orderId: string;
  }): Promise<boolean>;
  getOrderItemIds(args: {
    readonly tenantId: string;
    readonly orderId: string;
  }): Promise<readonly string[]>;
}

export interface InventoryRestockPort {
  restockStub(args: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly variantId: string;
    readonly quantity: string;
    readonly idempotencyKey: string;
  }): Promise<void>;
}

export interface FulfillmentRepository {
  createShipment(args: {
    readonly tenantId: string;
    readonly shipmentId: UuidV7;
    readonly orderId: string;
    readonly actorId: string;
    readonly carrier: string | null;
    readonly trackingCode: string | null;
    readonly items: readonly { readonly orderItemId: string; readonly quantity: string }[];
    readonly idempotencyKey: string;
  }): Promise<ShipmentRecord>;

  getShipment(args: {
    readonly tenantId: string;
    readonly shipmentId: string;
  }): Promise<ShipmentRecord | null>;

  updateShipment(args: {
    readonly tenantId: string;
    readonly shipmentId: string;
    readonly expectedVersion: number;
    readonly carrier?: string | null;
    readonly trackingCode?: string | null;
  }): Promise<ShipmentRecord>;

  transitionShipment(args: {
    readonly tenantId: string;
    readonly shipmentId: string;
    readonly actorId: string;
    readonly toStatus: ShipmentStatus;
    readonly idempotencyKey: string;
  }): Promise<ShipmentRecord>;

  createReturn(args: {
    readonly tenantId: string;
    readonly returnId: UuidV7;
    readonly orderId: string;
    readonly actorId: string;
    readonly reason: string;
    readonly items: readonly { readonly orderItemId: string; readonly quantity: string }[];
    readonly idempotencyKey: string;
  }): Promise<ReturnRecord>;

  getReturn(args: { readonly tenantId: string; readonly returnId: string }): Promise<ReturnRecord | null>;

  transitionReturn(args: {
    readonly tenantId: string;
    readonly returnId: string;
    readonly actorId: string;
    readonly toStatus: ReturnStatus;
    readonly idempotencyKey: string;
    readonly restock?: boolean;
  }): Promise<ReturnRecord>;

  getIdempotentShipment(tenantId: string, key: string): Promise<ShipmentRecord | null>;
  rememberIdempotentShipment(tenantId: string, key: string, shipment: ShipmentRecord): Promise<void>;
  getIdempotentReturn(tenantId: string, key: string): Promise<ReturnRecord | null>;
  rememberIdempotentReturn(tenantId: string, key: string, ret: ReturnRecord): Promise<void>;
  getIdempotentCommand(tenantId: string, key: string): Promise<ShipmentRecord | ReturnRecord | null>;
  rememberIdempotentCommand(
    tenantId: string,
    key: string,
    value: ShipmentRecord | ReturnRecord
  ): Promise<void>;
}

export function requireFulfillmentPermission(
  actorPermissions: readonly string[],
  permission: FulfillmentPermission
): void {
  if (!actorPermissions.includes(permission)) {
    throw new FulfillmentError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

function toShipmentResponse(s: ShipmentRecord): Record<string, unknown> {
  return {
    id: s.id,
    tenant_id: s.tenantId,
    order_id: s.orderId,
    status: s.status,
    carrier: s.carrier,
    tracking_code: s.trackingCode,
    version: s.version,
    created_at: s.createdAt,
    updated_at: s.updatedAt
  };
}

function toReturnResponse(r: ReturnRecord): Record<string, unknown> {
  return {
    id: r.id,
    tenant_id: r.tenantId,
    order_id: r.orderId,
    status: r.status,
    reason: r.reason,
    version: r.version,
    created_at: r.createdAt,
    updated_at: r.updatedAt
  };
}

export async function createShipment(options: {
  readonly repo: FulfillmentRepository;
  readonly orders: OrderEligibilityPort;
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly carrier?: string | null;
  readonly trackingCode?: string | null;
  readonly items: readonly { readonly order_item_id: string; readonly quantity: string }[];
}) {
  requireFulfillmentPermission(options.actorPermissions, "shipment.manage");
  if (!options.idempotencyKey?.trim()) {
    throw new FulfillmentError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const cached = await options.repo.getIdempotentShipment(options.tenantId, key);
  if (cached) {
    return { data: toShipmentResponse(cached), meta: {} };
  }
  const confirmed = await options.orders.isOrderConfirmed({
    tenantId: options.tenantId,
    orderId: options.orderId
  });
  if (!confirmed) {
    throw new FulfillmentError("Order must be confirmed.", "ORDER_STATE_INVALID");
  }
  if (!options.items?.length) {
    throw new FulfillmentError("items are required.", "VALIDATION_FAILED");
  }
  const shipment = await options.repo.createShipment({
    tenantId: options.tenantId,
    shipmentId: generateUuidV7(),
    orderId: options.orderId,
    actorId: options.actorId,
    carrier: options.carrier ?? null,
    trackingCode: options.trackingCode ?? null,
    items: options.items.map((i) => ({
      orderItemId: i.order_item_id,
      quantity: i.quantity
    })),
    idempotencyKey: key
  });
  await options.repo.rememberIdempotentShipment(options.tenantId, key, shipment);
  return { data: toShipmentResponse(shipment), meta: {} };
}

export async function updateShipment(options: {
  readonly repo: FulfillmentRepository;
  readonly tenantId: string;
  readonly shipmentId: string;
  readonly actorPermissions: readonly string[];
  readonly expectedVersion: number;
  readonly carrier?: string | null;
  readonly trackingCode?: string | null;
}) {
  requireFulfillmentPermission(options.actorPermissions, "shipment.manage");
  const shipment = await options.repo.updateShipment({
    tenantId: options.tenantId,
    shipmentId: options.shipmentId,
    expectedVersion: options.expectedVersion,
    ...(options.carrier !== undefined ? { carrier: options.carrier } : {}),
    ...(options.trackingCode !== undefined ? { trackingCode: options.trackingCode } : {})
  });
  return { data: toShipmentResponse(shipment), meta: {}, version: shipment.version };
}

type ShipmentCommandOptions = {
  readonly repo: FulfillmentRepository;
  readonly tenantId: string;
  readonly shipmentId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
};

async function transitionShipmentStatus(
  options: ShipmentCommandOptions & { readonly toStatus: ShipmentStatus }
) {
  requireFulfillmentPermission(options.actorPermissions, "shipment.manage");
  if (!options.idempotencyKey?.trim()) {
    throw new FulfillmentError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const cached = await options.repo.getIdempotentCommand(options.tenantId, key);
  if (cached && "trackingCode" in cached) {
    return { data: toShipmentResponse(cached), meta: {} };
  }
  const shipment = await options.repo.transitionShipment({
    tenantId: options.tenantId,
    shipmentId: options.shipmentId,
    actorId: options.actorId,
    toStatus: options.toStatus,
    idempotencyKey: key
  });
  await options.repo.rememberIdempotentCommand(options.tenantId, key, shipment);
  return { data: toShipmentResponse(shipment), meta: {} };
}

export async function markShipmentPacked(options: ShipmentCommandOptions) {
  return transitionShipmentStatus({ ...options, toStatus: "packed" });
}

export async function markShipmentShipped(options: ShipmentCommandOptions) {
  return transitionShipmentStatus({ ...options, toStatus: "shipped" });
}

export async function markShipmentDelivered(options: ShipmentCommandOptions) {
  return transitionShipmentStatus({ ...options, toStatus: "delivered" });
}

export async function createPackingSlipJob(options: {
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  requireFulfillmentPermission(options.actorPermissions, "packing_slip.print");
  if (!options.idempotencyKey?.trim()) {
    throw new FulfillmentError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  return {
    data: {
      id: generateUuidV7(),
      status: "queued" as const,
      resource_type: "packing_slip",
      resource_id: options.orderId
    },
    meta: {}
  };
}

export async function createReturn(options: {
  readonly repo: FulfillmentRepository;
  readonly orders: OrderEligibilityPort;
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly reason: string;
  readonly items: readonly { readonly order_item_id: string; readonly quantity: string }[];
}) {
  requireFulfillmentPermission(options.actorPermissions, "shipment.manage");
  if (!options.idempotencyKey?.trim()) {
    throw new FulfillmentError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const cached = await options.repo.getIdempotentReturn(options.tenantId, key);
  if (cached) {
    return { data: toReturnResponse(cached), meta: {} };
  }
  const confirmed = await options.orders.isOrderConfirmed({
    tenantId: options.tenantId,
    orderId: options.orderId
  });
  if (!confirmed) {
    throw new FulfillmentError("Order must be confirmed.", "ORDER_STATE_INVALID");
  }
  const ret = await options.repo.createReturn({
    tenantId: options.tenantId,
    returnId: generateUuidV7(),
    orderId: options.orderId,
    actorId: options.actorId,
    reason: options.reason.trim(),
    items: options.items.map((i) => ({
      orderItemId: i.order_item_id,
      quantity: i.quantity
    })),
    idempotencyKey: key
  });
  await options.repo.rememberIdempotentReturn(options.tenantId, key, ret);
  return { data: toReturnResponse(ret), meta: {} };
}

type ReturnCommandOptions = {
  readonly repo: FulfillmentRepository;
  readonly inventory?: InventoryRestockPort;
  readonly tenantId: string;
  readonly returnId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
};

async function transitionReturnStatus(
  options: ReturnCommandOptions & { readonly toStatus: ReturnStatus; readonly restock?: boolean }
) {
  requireFulfillmentPermission(options.actorPermissions, "shipment.manage");
  if (!options.idempotencyKey?.trim()) {
    throw new FulfillmentError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const cached = await options.repo.getIdempotentCommand(options.tenantId, key);
  if (cached && "reason" in cached) {
    return { data: toReturnResponse(cached), meta: {} };
  }
  const ret = await options.repo.transitionReturn({
    tenantId: options.tenantId,
    returnId: options.returnId,
    actorId: options.actorId,
    toStatus: options.toStatus,
    idempotencyKey: key,
    ...(options.restock !== undefined ? { restock: options.restock } : {})
  });
  if (options.restock && options.inventory) {
    for (const item of ret.items) {
      if (item.restocked) {
        await options.inventory.restockStub({
          tenantId: options.tenantId,
          actorId: options.actorId,
          variantId: item.orderItemId,
          quantity: item.quantity,
          idempotencyKey: `${key}:restock:${item.orderItemId}`
        });
      }
    }
  }
  await options.repo.rememberIdempotentCommand(options.tenantId, key, ret);
  return { data: toReturnResponse(ret), meta: {} };
}

export async function approveReturn(options: ReturnCommandOptions) {
  return transitionReturnStatus({ ...options, toStatus: "approved" });
}

export async function receiveReturn(options: ReturnCommandOptions) {
  return transitionReturnStatus({ ...options, toStatus: "received" });
}

export async function completeReturn(options: ReturnCommandOptions) {
  return transitionReturnStatus({ ...options, toStatus: "completed", restock: true });
}
