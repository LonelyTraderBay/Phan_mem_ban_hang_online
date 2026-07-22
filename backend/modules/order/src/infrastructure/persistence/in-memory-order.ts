import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  OrderError,
  type OrderHistoryRecord,
  type OrderItemRecord,
  type OrderRecord,
  type OrderRepository,
  type OrderStatus
} from "../../application/order.js";
import type { calculateOrderTotals } from "../../domain/order-calculation.js";

type MutableOrder = {
  id: string;
  tenantId: string;
  orderCode: string;
  customerId: string;
  conversationId: string | null;
  status: OrderStatus;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  feeMinor: number;
  grandTotalMinor: number;
  quoteVersion: string;
  reservationId: string | null;
  duplicateFingerprint: string | null;
  shippingAddressId: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItemRecord[];
};

function toRecord(row: MutableOrder): OrderRecord {
  return { ...row, items: [...row.items] };
}

function appendHistory(
  history: Map<string, OrderHistoryRecord[]>,
  args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly statusFrom: string | null;
    readonly statusTo: string;
    readonly reason: string | null;
    readonly actorId: string | null;
  }
): void {
  const list = history.get(args.orderId) ?? [];
  list.push({
    id: generateUuidV7(),
    tenantId: args.tenantId,
    orderId: args.orderId,
    statusFrom: args.statusFrom,
    statusTo: args.statusTo,
    reason: args.reason,
    actorId: args.actorId,
    occurredAt: new Date().toISOString()
  });
  history.set(args.orderId, list);
}

export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Map<string, MutableOrder>>();
  private readonly history = new Map<string, OrderHistoryRecord[]>();
  private readonly idempotentOrders = new Map<string, OrderRecord>();
  private readonly idempotentCommands = new Map<string, OrderRecord>();
  private orderSeq = 0;

  private tenantMap(tenantId: string): Map<string, MutableOrder> {
    let map = this.orders.get(tenantId);
    if (!map) {
      map = new Map();
      this.orders.set(tenantId, map);
    }
    return map;
  }

  private nextOrderCode(): string {
    this.orderSeq += 1;
    return `ORD-${Date.now()}-${this.orderSeq}`;
  }

  async listOrders(tenantId: string): Promise<readonly OrderRecord[]> {
    return [...(this.tenantMap(tenantId).values())].map(toRecord);
  }

  async getOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
  }): Promise<OrderRecord | null> {
    const row = this.tenantMap(args.tenantId).get(args.orderId);
    return row ? toRecord(row) : null;
  }

  async findByFingerprint(args: {
    readonly tenantId: string;
    readonly fingerprint: string;
    readonly withinHours?: number;
  }): Promise<OrderRecord | null> {
    const withinMs = (args.withinHours ?? 24) * 60 * 60 * 1000;
    const cutoff = Date.now() - withinMs;
    for (const row of this.tenantMap(args.tenantId).values()) {
      if (
        row.duplicateFingerprint === args.fingerprint &&
        Date.parse(row.createdAt) >= cutoff &&
        row.status !== "cancelled" &&
        row.status !== "expired"
      ) {
        return toRecord(row);
      }
    }
    return null;
  }

  async createOrderDraft(args: {
    readonly tenantId: string;
    readonly orderId: UuidV7;
    readonly actorId: string;
    readonly customerId: string;
    readonly conversationId: string | null;
    readonly currency: string;
    readonly shippingAddressId: string | null;
    readonly notes: string | null;
    readonly duplicateFingerprint: string;
    readonly quoteVersion: string;
    readonly totals: ReturnType<typeof calculateOrderTotals>;
    readonly items: readonly {
      readonly itemId: UuidV7;
      readonly variantId: string;
      readonly skuSnapshot: string | null;
      readonly unitPriceMinor: number;
      readonly unitCostMinor: number | null;
      readonly quantity: string;
      readonly calc: {
        readonly lineSubtotalMinor: number;
        readonly lineDiscountMinor: number;
        readonly lineTaxMinor: number;
        readonly lineTotalMinor: number;
      };
    }[];
  }): Promise<OrderRecord> {
    const now = new Date().toISOString();
    const items: OrderItemRecord[] = args.items.map((i) => ({
      id: i.itemId,
      tenantId: args.tenantId,
      orderId: args.orderId,
      variantId: i.variantId,
      skuSnapshot: i.skuSnapshot,
      unitPriceMinor: i.unitPriceMinor,
      unitCostMinor: i.unitCostMinor,
      quantity: i.quantity,
      lineSubtotalMinor: i.calc.lineSubtotalMinor,
      lineDiscountMinor: i.calc.lineDiscountMinor,
      lineTaxMinor: i.calc.lineTaxMinor,
      lineTotalMinor: i.calc.lineTotalMinor
    }));
    const row: MutableOrder = {
      id: args.orderId,
      tenantId: args.tenantId,
      orderCode: this.nextOrderCode(),
      customerId: args.customerId,
      conversationId: args.conversationId,
      status: "draft",
      currency: args.currency,
      subtotalMinor: args.totals.subtotalMinor,
      discountMinor: args.totals.discountMinor,
      taxMinor: args.totals.taxMinor,
      shippingMinor: args.totals.shippingMinor,
      feeMinor: args.totals.feeMinor,
      grandTotalMinor: args.totals.grandTotalMinor,
      quoteVersion: args.quoteVersion,
      reservationId: null,
      duplicateFingerprint: args.duplicateFingerprint,
      shippingAddressId: args.shippingAddressId,
      notes: args.notes,
      version: 1,
      createdAt: now,
      updatedAt: now,
      items
    };
    this.tenantMap(args.tenantId).set(args.orderId, row);
    appendHistory(this.history, {
      tenantId: args.tenantId,
      orderId: args.orderId,
      statusFrom: null,
      statusTo: "draft",
      reason: "created",
      actorId: args.actorId
    });
    return toRecord(row);
  }

  async updateOrderDraft(args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly actorId: string;
    readonly expectedVersion: number;
    readonly shippingAddressId?: string | null;
    readonly notes?: string | null;
    readonly items?: readonly { readonly variantId: string; readonly quantity: string }[];
    readonly totals?: ReturnType<typeof calculateOrderTotals>;
    readonly itemRows?: readonly {
      readonly itemId: UuidV7;
      readonly variantId: string;
      readonly skuSnapshot: string | null;
      readonly unitPriceMinor: number;
      readonly unitCostMinor: number | null;
      readonly quantity: string;
      readonly calc: {
        readonly lineSubtotalMinor: number;
        readonly lineDiscountMinor: number;
        readonly lineTaxMinor: number;
        readonly lineTotalMinor: number;
      };
    }[];
    readonly quoteVersion: string;
    readonly duplicateFingerprint?: string;
  }): Promise<OrderRecord> {
    const row = this.tenantMap(args.tenantId).get(args.orderId);
    if (!row) {
      throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
    }
    if (row.version !== args.expectedVersion) {
      throw new OrderError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
    }
    if (args.shippingAddressId !== undefined) row.shippingAddressId = args.shippingAddressId;
    if (args.notes !== undefined) row.notes = args.notes;
    if (args.totals) {
      row.subtotalMinor = args.totals.subtotalMinor;
      row.discountMinor = args.totals.discountMinor;
      row.taxMinor = args.totals.taxMinor;
      row.shippingMinor = args.totals.shippingMinor;
      row.feeMinor = args.totals.feeMinor;
      row.grandTotalMinor = args.totals.grandTotalMinor;
    }
    if (args.itemRows) {
      row.items = args.itemRows.map((i) => ({
        id: i.itemId,
        tenantId: args.tenantId,
        orderId: args.orderId,
        variantId: i.variantId,
        skuSnapshot: i.skuSnapshot,
        unitPriceMinor: i.unitPriceMinor,
        unitCostMinor: i.unitCostMinor,
        quantity: i.quantity,
        lineSubtotalMinor: i.calc.lineSubtotalMinor,
        lineDiscountMinor: i.calc.lineDiscountMinor,
        lineTaxMinor: i.calc.lineTaxMinor,
        lineTotalMinor: i.calc.lineTotalMinor
      }));
    }
    if (args.duplicateFingerprint) row.duplicateFingerprint = args.duplicateFingerprint;
    row.quoteVersion = args.quoteVersion;
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    return toRecord(row);
  }

  async setReservation(args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly reservationId: string;
    readonly actorId: string;
  }): Promise<OrderRecord> {
    const row = this.tenantMap(args.tenantId).get(args.orderId);
    if (!row) {
      throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
    }
    const from = row.status;
    row.reservationId = args.reservationId;
    row.status = "reserved";
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    appendHistory(this.history, {
      tenantId: args.tenantId,
      orderId: args.orderId,
      statusFrom: from,
      statusTo: "reserved",
      reason: "inventory_reserved",
      actorId: args.actorId
    });
    return toRecord(row);
  }

  async confirmOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly actorId: string;
    readonly expectedVersion: number;
    readonly quoteVersion: string;
    readonly totals: ReturnType<typeof calculateOrderTotals>;
    readonly snapshotItems: readonly OrderItemRecord[];
  }): Promise<OrderRecord> {
    const row = this.tenantMap(args.tenantId).get(args.orderId);
    if (!row) {
      throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
    }
    if (row.version !== args.expectedVersion) {
      throw new OrderError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
    }
    const from = row.status;
    row.status = "confirmed";
    row.items = [...args.snapshotItems];
    row.subtotalMinor = args.totals.subtotalMinor;
    row.discountMinor = args.totals.discountMinor;
    row.taxMinor = args.totals.taxMinor;
    row.grandTotalMinor = args.totals.grandTotalMinor;
    row.quoteVersion = args.quoteVersion;
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    appendHistory(this.history, {
      tenantId: args.tenantId,
      orderId: args.orderId,
      statusFrom: from,
      statusTo: "confirmed",
      reason: "confirmed",
      actorId: args.actorId
    });
    return toRecord(row);
  }

  async cancelOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly actorId: string;
    readonly expectedVersion: number;
    readonly reason: string;
  }): Promise<OrderRecord> {
    const row = this.tenantMap(args.tenantId).get(args.orderId);
    if (!row) {
      throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
    }
    if (row.version !== args.expectedVersion) {
      throw new OrderError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
    }
    const from = row.status;
    row.status = "cancelled";
    row.reservationId = null;
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    appendHistory(this.history, {
      tenantId: args.tenantId,
      orderId: args.orderId,
      statusFrom: from,
      statusTo: "cancelled",
      reason: args.reason,
      actorId: args.actorId
    });
    return toRecord(row);
  }

  async expireOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly actorId: string;
  }): Promise<OrderRecord> {
    const row = this.tenantMap(args.tenantId).get(args.orderId);
    if (!row) {
      throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
    }
    const from = row.status;
    row.status = "expired";
    row.reservationId = null;
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    appendHistory(this.history, {
      tenantId: args.tenantId,
      orderId: args.orderId,
      statusFrom: from,
      statusTo: "expired",
      reason: "expired",
      actorId: args.actorId
    });
    return toRecord(row);
  }

  async listHistory(args: {
    readonly tenantId: string;
    readonly orderId: string;
  }): Promise<readonly OrderHistoryRecord[]> {
    const order = this.tenantMap(args.tenantId).get(args.orderId);
    if (!order) return [];
    return [...(this.history.get(args.orderId) ?? [])];
  }

  async getIdempotentOrder(tenantId: string, key: string): Promise<OrderRecord | null> {
    return this.idempotentOrders.get(`${tenantId}:${key}`) ?? null;
  }

  async rememberIdempotentOrder(tenantId: string, key: string, order: OrderRecord): Promise<void> {
    this.idempotentOrders.set(`${tenantId}:${key}`, order);
  }

  async getIdempotentCommand(tenantId: string, key: string): Promise<OrderRecord | null> {
    return this.idempotentCommands.get(`${tenantId}:${key}`) ?? null;
  }

  async rememberIdempotentCommand(tenantId: string, key: string, order: OrderRecord): Promise<void> {
    this.idempotentCommands.set(`${tenantId}:${key}`, order);
  }
}
