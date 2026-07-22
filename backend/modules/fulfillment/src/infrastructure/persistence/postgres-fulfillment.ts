import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  FulfillmentError,
  type FulfillmentRepository,
  type ReturnRecord,
  type ReturnStatus,
  type ShipmentRecord,
  type ShipmentStatus
} from "../../application/fulfillment.js";

type Trx = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];

type ShipmentRow = {
  id: string;
  tenant_id: string;
  order_id: string;
  status: ShipmentStatus;
  carrier: string | null;
  tracking_code: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type ReturnRow = {
  id: string;
  tenant_id: string;
  order_id: string;
  status: ReturnStatus;
  reason: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type ShipmentItemRow = {
  order_item_id: string;
  quantity: string | number;
};

type ReturnItemRow = {
  order_item_id: string;
  quantity: string | number;
  restocked: boolean;
};

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

function formatQuantity(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(6).replace(/\.?0+$/, "") || "0";
}

function toShipment(row: ShipmentRow, items: ShipmentRecord["items"]): ShipmentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderId: row.order_id,
    status: row.status,
    carrier: row.carrier,
    trackingCode: row.tracking_code,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    items
  };
}

function toReturn(row: ReturnRow, items: ReturnRecord["items"]): ReturnRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderId: row.order_id,
    status: row.status,
    reason: row.reason,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    items
  };
}

/** v1 process-local idempotency — migrate to app.idempotency_records when wired. */
export class PostgresFulfillmentRepository implements FulfillmentRepository {
  private readonly idempotentShipments = new Map<string, ShipmentRecord>();
  private readonly idempotentReturns = new Map<string, ReturnRecord>();
  private readonly idempotentCommands = new Map<string, ShipmentRecord | ReturnRecord>();

  constructor(private readonly db: AppDatabase) {}

  private idemKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  private async loadShipmentItems(
    trx: Trx,
    tenantId: string,
    shipmentId: string
  ): Promise<ShipmentRecord["items"]> {
    const result = await sql<ShipmentItemRow>`
      select order_item_id, quantity
      from app.shipment_items
      where tenant_id = ${tenantId}::uuid and shipment_id = ${shipmentId}::uuid
      order by created_at asc, id asc
    `.execute(trx);
    return result.rows.map((r) => ({
      orderItemId: r.order_item_id,
      quantity: formatQuantity(r.quantity)
    }));
  }

  private async loadReturnItems(
    trx: Trx,
    tenantId: string,
    returnId: string
  ): Promise<ReturnRecord["items"]> {
    const result = await sql<ReturnItemRow>`
      select order_item_id, quantity, restocked
      from app.return_items
      where tenant_id = ${tenantId}::uuid and return_id = ${returnId}::uuid
      order by created_at asc, id asc
    `.execute(trx);
    return result.rows.map((r) => ({
      orderItemId: r.order_item_id,
      quantity: formatQuantity(r.quantity),
      restocked: Boolean(r.restocked)
    }));
  }

  private async loadShipment(
    trx: Trx,
    tenantId: string,
    shipmentId: string,
    options?: { readonly forUpdate?: boolean }
  ): Promise<ShipmentRecord | null> {
    const result = options?.forUpdate
      ? await sql<ShipmentRow>`
          select id, tenant_id, order_id, status, carrier, tracking_code,
                 version, created_at, updated_at
          from app.shipments
          where id = ${shipmentId}::uuid and tenant_id = ${tenantId}::uuid
          for update
        `.execute(trx)
      : await sql<ShipmentRow>`
          select id, tenant_id, order_id, status, carrier, tracking_code,
                 version, created_at, updated_at
          from app.shipments
          where id = ${shipmentId}::uuid and tenant_id = ${tenantId}::uuid
        `.execute(trx);
    const row = result.rows[0];
    if (!row) return null;
    const items = await this.loadShipmentItems(trx, tenantId, shipmentId);
    return toShipment(row, items);
  }

  private async loadReturn(
    trx: Trx,
    tenantId: string,
    returnId: string,
    options?: { readonly forUpdate?: boolean }
  ): Promise<ReturnRecord | null> {
    const result = options?.forUpdate
      ? await sql<ReturnRow>`
          select id, tenant_id, order_id, status, reason, version, created_at, updated_at
          from app.returns
          where id = ${returnId}::uuid and tenant_id = ${tenantId}::uuid
          for update
        `.execute(trx)
      : await sql<ReturnRow>`
          select id, tenant_id, order_id, status, reason, version, created_at, updated_at
          from app.returns
          where id = ${returnId}::uuid and tenant_id = ${tenantId}::uuid
        `.execute(trx);
    const row = result.rows[0];
    if (!row) return null;
    const items = await this.loadReturnItems(trx, tenantId, returnId);
    return toReturn(row, items);
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
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        insert into app.shipments (
          id, tenant_id, order_id, status, carrier, tracking_code, version, created_by, updated_by
        ) values (
          ${args.shipmentId}::uuid,
          ${args.tenantId}::uuid,
          ${args.orderId}::uuid,
          'pending',
          ${args.carrier},
          ${args.trackingCode},
          1,
          ${args.actorId}::uuid,
          ${args.actorId}::uuid
        )
      `.execute(trx);

      for (const item of args.items) {
        await sql`
          insert into app.shipment_items (
            id, tenant_id, shipment_id, order_item_id, quantity
          ) values (
            ${generateUuidV7()}::uuid,
            ${args.tenantId}::uuid,
            ${args.shipmentId}::uuid,
            ${item.orderItemId}::uuid,
            ${item.quantity}::numeric
          )
        `.execute(trx);
      }

      const loaded = await this.loadShipment(trx, args.tenantId, args.shipmentId);
      if (!loaded) {
        throw new FulfillmentError("Shipment not found after create.", "RESOURCE_NOT_FOUND");
      }
      return loaded;
    });
  }

  async getShipment(args: {
    readonly tenantId: string;
    readonly shipmentId: string;
  }): Promise<ShipmentRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) =>
      this.loadShipment(trx, args.tenantId, args.shipmentId)
    );
  }

  async updateShipment(args: {
    readonly tenantId: string;
    readonly shipmentId: string;
    readonly expectedVersion: number;
    readonly carrier?: string | null;
    readonly trackingCode?: string | null;
  }): Promise<ShipmentRecord> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadShipment(trx, args.tenantId, args.shipmentId, {
        forUpdate: true
      });
      if (!current) {
        throw new FulfillmentError("Shipment not found.", "RESOURCE_NOT_FOUND");
      }
      if (current.version !== args.expectedVersion) {
        throw new FulfillmentError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const nextCarrier = args.carrier !== undefined ? args.carrier : current.carrier;
      const nextTracking =
        args.trackingCode !== undefined ? args.trackingCode : current.trackingCode;

      const updated = await sql<ShipmentRow>`
        update app.shipments
        set carrier = ${nextCarrier},
            tracking_code = ${nextTracking},
            version = version + 1,
            updated_at = now()
        where id = ${args.shipmentId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and version = ${args.expectedVersion}
        returning id, tenant_id, order_id, status, carrier, tracking_code,
                  version, created_at, updated_at
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new FulfillmentError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const items = await this.loadShipmentItems(trx, args.tenantId, args.shipmentId);
      return toShipment(updated.rows[0], items);
    });
  }

  async transitionShipment(args: {
    readonly tenantId: string;
    readonly shipmentId: string;
    readonly actorId: string;
    readonly toStatus: ShipmentStatus;
    readonly idempotencyKey: string;
  }): Promise<ShipmentRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadShipment(trx, args.tenantId, args.shipmentId, {
        forUpdate: true
      });
      if (!current) {
        throw new FulfillmentError("Shipment not found.", "RESOURCE_NOT_FOUND");
      }
      if (!SHIPMENT_TRANSITIONS[current.status].includes(args.toStatus)) {
        throw new FulfillmentError("Invalid shipment transition.", "ORDER_STATE_INVALID");
      }

      const updated = await sql<ShipmentRow>`
        update app.shipments
        set status = ${args.toStatus},
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.shipmentId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and status = ${current.status}
          and version = ${current.version}
        returning id, tenant_id, order_id, status, carrier, tracking_code,
                  version, created_at, updated_at
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new FulfillmentError("Invalid shipment transition.", "ORDER_STATE_INVALID");
      }
      const items = await this.loadShipmentItems(trx, args.tenantId, args.shipmentId);
      return toShipment(updated.rows[0], items);
    });
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
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        insert into app.returns (
          id, tenant_id, order_id, status, reason, version, created_by, updated_by
        ) values (
          ${args.returnId}::uuid,
          ${args.tenantId}::uuid,
          ${args.orderId}::uuid,
          'requested',
          ${args.reason},
          1,
          ${args.actorId}::uuid,
          ${args.actorId}::uuid
        )
      `.execute(trx);

      for (const item of args.items) {
        await sql`
          insert into app.return_items (
            id, tenant_id, return_id, order_item_id, quantity, restocked
          ) values (
            ${generateUuidV7()}::uuid,
            ${args.tenantId}::uuid,
            ${args.returnId}::uuid,
            ${item.orderItemId}::uuid,
            ${item.quantity}::numeric,
            false
          )
        `.execute(trx);
      }

      const loaded = await this.loadReturn(trx, args.tenantId, args.returnId);
      if (!loaded) {
        throw new FulfillmentError("Return not found after create.", "RESOURCE_NOT_FOUND");
      }
      return loaded;
    });
  }

  async getReturn(args: {
    readonly tenantId: string;
    readonly returnId: string;
  }): Promise<ReturnRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) =>
      this.loadReturn(trx, args.tenantId, args.returnId)
    );
  }

  async transitionReturn(args: {
    readonly tenantId: string;
    readonly returnId: string;
    readonly actorId: string;
    readonly toStatus: ReturnStatus;
    readonly idempotencyKey: string;
    readonly restock?: boolean;
  }): Promise<ReturnRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadReturn(trx, args.tenantId, args.returnId, {
        forUpdate: true
      });
      if (!current) {
        throw new FulfillmentError("Return not found.", "RESOURCE_NOT_FOUND");
      }
      if (!RETURN_TRANSITIONS[current.status].includes(args.toStatus)) {
        throw new FulfillmentError("Invalid return transition.", "RETURN_STATE_INVALID");
      }

      const updated = await sql<ReturnRow>`
        update app.returns
        set status = ${args.toStatus},
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.returnId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and status = ${current.status}
          and version = ${current.version}
        returning id, tenant_id, order_id, status, reason, version, created_at, updated_at
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new FulfillmentError("Invalid return transition.", "RETURN_STATE_INVALID");
      }

      if (args.restock) {
        await sql`
          update app.return_items
          set restocked = true
          where tenant_id = ${args.tenantId}::uuid and return_id = ${args.returnId}::uuid
        `.execute(trx);
      }

      const items = await this.loadReturnItems(trx, args.tenantId, args.returnId);
      return toReturn(updated.rows[0], items);
    });
  }

  async getIdempotentShipment(tenantId: string, key: string): Promise<ShipmentRecord | null> {
    return this.idempotentShipments.get(this.idemKey(tenantId, key)) ?? null;
  }

  async rememberIdempotentShipment(
    tenantId: string,
    key: string,
    shipment: ShipmentRecord
  ): Promise<void> {
    this.idempotentShipments.set(this.idemKey(tenantId, key), shipment);
  }

  async getIdempotentReturn(tenantId: string, key: string): Promise<ReturnRecord | null> {
    return this.idempotentReturns.get(this.idemKey(tenantId, key)) ?? null;
  }

  async rememberIdempotentReturn(tenantId: string, key: string, ret: ReturnRecord): Promise<void> {
    this.idempotentReturns.set(this.idemKey(tenantId, key), ret);
  }

  async getIdempotentCommand(
    tenantId: string,
    key: string
  ): Promise<ShipmentRecord | ReturnRecord | null> {
    return this.idempotentCommands.get(this.idemKey(tenantId, key)) ?? null;
  }

  async rememberIdempotentCommand(
    tenantId: string,
    key: string,
    value: ShipmentRecord | ReturnRecord
  ): Promise<void> {
    this.idempotentCommands.set(this.idemKey(tenantId, key), value);
  }
}
