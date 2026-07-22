import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  FulfillmentError,
  type FulfillmentRepository,
  type ReturnRecord,
  type ReturnStatus,
  type ShipmentRecord,
  type ShipmentStatus
} from "../../application/fulfillment.js";

const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  pending: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: []
};

const RETURN_TRANSITIONS: Record<ReturnStatus, readonly ReturnStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["received"],
  received: ["completed"],
  completed: [],
  rejected: []
};

export class InMemoryFulfillmentRepository implements FulfillmentRepository {
  private readonly shipments = new Map<string, Map<string, ShipmentRecord>>();
  private readonly returns = new Map<string, Map<string, ReturnRecord>>();
  private readonly idempotentShipments = new Map<string, ShipmentRecord>();
  private readonly idempotentReturns = new Map<string, ReturnRecord>();
  private readonly idempotentCommands = new Map<string, ShipmentRecord | ReturnRecord>();

  private tenantShipments(tenantId: string): Map<string, ShipmentRecord> {
    let map = this.shipments.get(tenantId);
    if (!map) {
      map = new Map();
      this.shipments.set(tenantId, map);
    }
    return map;
  }

  private tenantReturns(tenantId: string): Map<string, ReturnRecord> {
    let map = this.returns.get(tenantId);
    if (!map) {
      map = new Map();
      this.returns.set(tenantId, map);
    }
    return map;
  }

  async createShipment(args: {
    readonly tenantId: string;
    readonly shipmentId: UuidV7;
    readonly orderId: string;
    readonly actorId: string;
    readonly carrier: string | null;
    readonly trackingCode: string | null;
    readonly items: readonly { readonly orderItemId: string; readonly quantity: string }[];
    readonly idempotencyKey: string;
  }): Promise<ShipmentRecord> {
    const now = new Date().toISOString();
    const row: ShipmentRecord = {
      id: args.shipmentId,
      tenantId: args.tenantId,
      orderId: args.orderId,
      status: "pending",
      carrier: args.carrier,
      trackingCode: args.trackingCode,
      version: 1,
      createdAt: now,
      updatedAt: now,
      items: [...args.items]
    };
    this.tenantShipments(args.tenantId).set(args.shipmentId, row);
    return row;
  }

  async getShipment(args: {
    readonly tenantId: string;
    readonly shipmentId: string;
  }): Promise<ShipmentRecord | null> {
    return this.tenantShipments(args.tenantId).get(args.shipmentId) ?? null;
  }

  async updateShipment(args: {
    readonly tenantId: string;
    readonly shipmentId: string;
    readonly expectedVersion: number;
    readonly carrier?: string | null;
    readonly trackingCode?: string | null;
  }): Promise<ShipmentRecord> {
    const row = this.tenantShipments(args.tenantId).get(args.shipmentId);
    if (!row) {
      throw new FulfillmentError("Shipment not found.", "RESOURCE_NOT_FOUND");
    }
    if (row.version !== args.expectedVersion) {
      throw new FulfillmentError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
    }
    const updated: ShipmentRecord = {
      ...row,
      carrier: args.carrier !== undefined ? args.carrier : row.carrier,
      trackingCode: args.trackingCode !== undefined ? args.trackingCode : row.trackingCode,
      version: row.version + 1,
      updatedAt: new Date().toISOString()
    };
    this.tenantShipments(args.tenantId).set(args.shipmentId, updated);
    return updated;
  }

  async transitionShipment(args: {
    readonly tenantId: string;
    readonly shipmentId: string;
    readonly actorId: string;
    readonly toStatus: ShipmentStatus;
    readonly idempotencyKey: string;
  }): Promise<ShipmentRecord> {
    const row = this.tenantShipments(args.tenantId).get(args.shipmentId);
    if (!row) {
      throw new FulfillmentError("Shipment not found.", "RESOURCE_NOT_FOUND");
    }
    if (!SHIPMENT_TRANSITIONS[row.status].includes(args.toStatus)) {
      throw new FulfillmentError("Invalid shipment transition.", "ORDER_STATE_INVALID");
    }
    const updated: ShipmentRecord = {
      ...row,
      status: args.toStatus,
      version: row.version + 1,
      updatedAt: new Date().toISOString()
    };
    this.tenantShipments(args.tenantId).set(args.shipmentId, updated);
    return updated;
  }

  async createReturn(args: {
    readonly tenantId: string;
    readonly returnId: UuidV7;
    readonly orderId: string;
    readonly actorId: string;
    readonly reason: string;
    readonly items: readonly { readonly orderItemId: string; readonly quantity: string }[];
    readonly idempotencyKey: string;
  }): Promise<ReturnRecord> {
    const now = new Date().toISOString();
    const row: ReturnRecord = {
      id: args.returnId,
      tenantId: args.tenantId,
      orderId: args.orderId,
      status: "requested",
      reason: args.reason,
      version: 1,
      createdAt: now,
      updatedAt: now,
      items: args.items.map((i) => ({ ...i, restocked: false }))
    };
    this.tenantReturns(args.tenantId).set(args.returnId, row);
    return row;
  }

  async getReturn(args: {
    readonly tenantId: string;
    readonly returnId: string;
  }): Promise<ReturnRecord | null> {
    return this.tenantReturns(args.tenantId).get(args.returnId) ?? null;
  }

  async transitionReturn(args: {
    readonly tenantId: string;
    readonly returnId: string;
    readonly actorId: string;
    readonly toStatus: ReturnStatus;
    readonly idempotencyKey: string;
    readonly restock?: boolean;
  }): Promise<ReturnRecord> {
    const row = this.tenantReturns(args.tenantId).get(args.returnId);
    if (!row) {
      throw new FulfillmentError("Return not found.", "RESOURCE_NOT_FOUND");
    }
    if (!RETURN_TRANSITIONS[row.status].includes(args.toStatus)) {
      throw new FulfillmentError("Invalid return transition.", "RETURN_STATE_INVALID");
    }
    const updated: ReturnRecord = {
      ...row,
      status: args.toStatus,
      items: row.items.map((i) => ({
        ...i,
        restocked: args.restock ? true : i.restocked
      })),
      version: row.version + 1,
      updatedAt: new Date().toISOString()
    };
    this.tenantReturns(args.tenantId).set(args.returnId, updated);
    return updated;
  }

  async getIdempotentShipment(tenantId: string, key: string): Promise<ShipmentRecord | null> {
    return this.idempotentShipments.get(`${tenantId}:${key}`) ?? null;
  }

  async rememberIdempotentShipment(
    tenantId: string,
    key: string,
    shipment: ShipmentRecord
  ): Promise<void> {
    this.idempotentShipments.set(`${tenantId}:${key}`, shipment);
  }

  async getIdempotentReturn(tenantId: string, key: string): Promise<ReturnRecord | null> {
    return this.idempotentReturns.get(`${tenantId}:${key}`) ?? null;
  }

  async rememberIdempotentReturn(tenantId: string, key: string, ret: ReturnRecord): Promise<void> {
    this.idempotentReturns.set(`${tenantId}:${key}`, ret);
  }

  async getIdempotentCommand(
    tenantId: string,
    key: string
  ): Promise<ShipmentRecord | ReturnRecord | null> {
    return this.idempotentCommands.get(`${tenantId}:${key}`) ?? null;
  }

  async rememberIdempotentCommand(
    tenantId: string,
    key: string,
    value: ShipmentRecord | ReturnRecord
  ): Promise<void> {
    this.idempotentCommands.set(`${tenantId}:${key}`, value);
  }
}
