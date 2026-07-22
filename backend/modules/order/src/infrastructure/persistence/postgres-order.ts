import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  OrderError,
  TAX_RATE_BPS,
  type OrderHistoryRecord,
  type OrderItemRecord,
  type OrderRecord,
  type OrderRepository,
  type OrderStatus
} from "../../application/order.js";
import type { calculateOrderTotals } from "../../domain/order-calculation.js";

type OrderRow = {
  id: string;
  tenant_id: string;
  order_code: string;
  customer_id: string;
  conversation_id: string | null;
  status: OrderStatus;
  currency: string;
  subtotal_minor: string | number;
  discount_minor: string | number;
  tax_minor: string | number;
  shipping_minor: string | number;
  fee_minor: string | number;
  grand_total_minor: string | number;
  quote_version: string;
  reservation_id: string | null;
  duplicate_fingerprint: string | null;
  shipping_address_id: string | null;
  notes: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type ItemRow = {
  id: string;
  tenant_id: string;
  order_id: string;
  variant_id: string;
  sku_snapshot: string | null;
  unit_price_minor: string | number;
  unit_cost_minor: string | number | null;
  quantity: string;
  line_subtotal_minor: string | number;
  line_discount_minor: string | number;
  line_tax_minor: string | number;
  line_total_minor: string | number;
};

type HistoryRow = {
  id: string;
  tenant_id: string;
  order_id: string;
  status_from: string | null;
  status_to: string;
  reason: string | null;
  actor_id: string | null;
  occurred_at: Date;
};

type Trx = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];

/** Empty string → null so `${value}::uuid` does not reject optional UUID columns. */
function asUuidOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function formatQuantity(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(6).replace(/\.?0+$/, "") || "0";
}

function toItem(row: ItemRow): OrderItemRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderId: row.order_id,
    variantId: row.variant_id,
    skuSnapshot: row.sku_snapshot,
    unitPriceMinor: Number(row.unit_price_minor),
    unitCostMinor: row.unit_cost_minor == null ? null : Number(row.unit_cost_minor),
    quantity: formatQuantity(row.quantity),
    lineSubtotalMinor: Number(row.line_subtotal_minor),
    lineDiscountMinor: Number(row.line_discount_minor),
    lineTaxMinor: Number(row.line_tax_minor),
    lineTotalMinor: Number(row.line_total_minor)
  };
}

function toOrder(row: OrderRow, items: readonly OrderItemRecord[]): OrderRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderCode: row.order_code,
    customerId: row.customer_id,
    conversationId: row.conversation_id,
    status: row.status,
    currency: row.currency.trim(),
    subtotalMinor: Number(row.subtotal_minor),
    discountMinor: Number(row.discount_minor),
    taxMinor: Number(row.tax_minor),
    shippingMinor: Number(row.shipping_minor),
    feeMinor: Number(row.fee_minor),
    grandTotalMinor: Number(row.grand_total_minor),
    quoteVersion: row.quote_version,
    reservationId: row.reservation_id,
    duplicateFingerprint: row.duplicate_fingerprint,
    shippingAddressId: row.shipping_address_id,
    notes: row.notes,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    items
  };
}

/** v1 process-local idempotency — migrate to app.idempotency_records when wired. */
export class PostgresOrderRepository implements OrderRepository {
  private readonly idempotentOrders = new Map<string, OrderRecord>();
  private readonly idempotentCommands = new Map<string, OrderRecord>();

  constructor(private readonly db: AppDatabase) {}

  private idemKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  /** Globally unique enough for multi-instance (uses UUIDv7, not process counter). */
  private nextOrderCode(): string {
    return `ORD-${generateUuidV7().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  }

  private async loadItems(trx: Trx, tenantId: string, orderId: string): Promise<OrderItemRecord[]> {
    const result = await sql<ItemRow>`
      select id, tenant_id, order_id, variant_id, sku_snapshot, unit_price_minor,
             unit_cost_minor, quantity, line_subtotal_minor, line_discount_minor,
             line_tax_minor, line_total_minor
      from app.order_items
      where tenant_id = ${tenantId}::uuid and order_id = ${orderId}::uuid
      order by created_at asc, id asc
    `.execute(trx);
    return result.rows.map(toItem);
  }

  private async loadOrder(trx: Trx, tenantId: string, orderId: string): Promise<OrderRecord | null> {
    const result = await sql<OrderRow>`
      select id, tenant_id, order_code, customer_id, conversation_id, status, currency,
             subtotal_minor, discount_minor, tax_minor, shipping_minor, fee_minor,
             grand_total_minor, quote_version, reservation_id, duplicate_fingerprint,
             shipping_address_id, notes, version, created_at, updated_at
      from app.orders
      where id = ${orderId}::uuid and tenant_id = ${tenantId}::uuid
    `.execute(trx);
    const row = result.rows[0];
    if (!row) return null;
    const items = await this.loadItems(trx, tenantId, orderId);
    return toOrder(row, items);
  }

  private async appendHistory(
    trx: Trx,
    args: {
      readonly tenantId: string;
      readonly orderId: string;
      readonly statusFrom: string | null;
      readonly statusTo: string;
      readonly reason: string | null;
      readonly actorId: string | null;
    }
  ): Promise<void> {
    await sql`
      insert into app.order_status_history (
        id, tenant_id, order_id, status_from, status_to, reason, actor_id
      ) values (
        ${generateUuidV7()}::uuid,
        ${args.tenantId}::uuid,
        ${args.orderId}::uuid,
        ${args.statusFrom},
        ${args.statusTo},
        ${args.reason},
        ${args.actorId}::uuid
      )
    `.execute(trx);
  }

  private async replaceItems(
    trx: Trx,
    tenantId: string,
    orderId: string,
    items: readonly {
      readonly itemId: UuidV7 | string;
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
    }[]
  ): Promise<void> {
    await sql`
      delete from app.order_items
      where tenant_id = ${tenantId}::uuid and order_id = ${orderId}::uuid
    `.execute(trx);
    for (const item of items) {
      await sql`
        insert into app.order_items (
          id, tenant_id, order_id, variant_id, sku_snapshot, unit_price_minor,
          unit_cost_minor, quantity, line_subtotal_minor, line_discount_minor,
          line_tax_minor, line_total_minor
        ) values (
          ${item.itemId}::uuid,
          ${tenantId}::uuid,
          ${orderId}::uuid,
          ${item.variantId}::uuid,
          ${item.skuSnapshot},
          ${item.unitPriceMinor},
          ${item.unitCostMinor},
          ${item.quantity}::numeric,
          ${item.calc.lineSubtotalMinor},
          ${item.calc.lineDiscountMinor},
          ${item.calc.lineTaxMinor},
          ${item.calc.lineTotalMinor}
        )
      `.execute(trx);
    }
  }

  async listOrders(tenantId: string): Promise<readonly OrderRecord[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<OrderRow>`
        select id, tenant_id, order_code, customer_id, conversation_id, status, currency,
               subtotal_minor, discount_minor, tax_minor, shipping_minor, fee_minor,
               grand_total_minor, quote_version, reservation_id, duplicate_fingerprint,
               shipping_address_id, notes, version, created_at, updated_at
        from app.orders
        order by updated_at desc
      `.execute(trx);
      const out: OrderRecord[] = [];
      for (const row of result.rows) {
        const items = await this.loadItems(trx, tenantId, row.id);
        out.push(toOrder(row, items));
      }
      return out;
    });
  }

  async getOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
  }): Promise<OrderRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) =>
      this.loadOrder(trx, args.tenantId, args.orderId)
    );
  }

  async findByFingerprint(args: {
    readonly tenantId: string;
    readonly fingerprint: string;
    readonly withinHours?: number;
  }): Promise<OrderRecord | null> {
    const withinHours = args.withinHours ?? 24;
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<OrderRow>`
        select id, tenant_id, order_code, customer_id, conversation_id, status, currency,
               subtotal_minor, discount_minor, tax_minor, shipping_minor, fee_minor,
               grand_total_minor, quote_version, reservation_id, duplicate_fingerprint,
               shipping_address_id, notes, version, created_at, updated_at
        from app.orders
        where tenant_id = ${args.tenantId}::uuid
          and duplicate_fingerprint = ${args.fingerprint}
          and status in ('draft', 'reserved', 'confirmed')
          and created_at >= now() - (${withinHours}::text || ' hours')::interval
        order by created_at desc
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      if (!row) return null;
      const items = await this.loadItems(trx, args.tenantId, row.id);
      return toOrder(row, items);
    });
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
    readonly idempotencyKey: string;
  }): Promise<OrderRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const orderCode = this.nextOrderCode();
      const conversationId = asUuidOrNull(args.conversationId);
      const shippingAddressId = asUuidOrNull(args.shippingAddressId);
      await sql`
        insert into app.orders (
          id, tenant_id, order_code, status, customer_id, conversation_id, currency,
          subtotal_minor, discount_minor, tax_minor, shipping_minor, fee_minor,
          grand_total_minor, tax_rate_bps, prices_tax_inclusive, quote_version,
          duplicate_fingerprint, shipping_address_id, notes, version, created_by, updated_by
        ) values (
          ${args.orderId}::uuid,
          ${args.tenantId}::uuid,
          ${orderCode},
          'draft',
          ${args.customerId}::uuid,
          ${conversationId}::uuid,
          ${args.currency},
          ${args.totals.subtotalMinor},
          ${args.totals.discountMinor},
          ${args.totals.taxMinor},
          ${args.totals.shippingMinor},
          ${args.totals.feeMinor},
          ${args.totals.grandTotalMinor},
          ${TAX_RATE_BPS},
          true,
          ${args.quoteVersion},
          ${args.duplicateFingerprint},
          ${shippingAddressId}::uuid,
          ${args.notes},
          1,
          ${args.actorId}::uuid,
          ${args.actorId}::uuid
        )
      `.execute(trx);

      await this.replaceItems(trx, args.tenantId, args.orderId, args.items);
      await this.appendHistory(trx, {
        tenantId: args.tenantId,
        orderId: args.orderId,
        statusFrom: null,
        statusTo: "draft",
        reason: "created",
        actorId: args.actorId
      });

      const loaded = await this.loadOrder(trx, args.tenantId, args.orderId);
      if (!loaded) {
        throw new OrderError("Order not found after create.", "RESOURCE_NOT_FOUND");
      }
      return loaded;
    });
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
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadOrder(trx, args.tenantId, args.orderId);
      if (!current) {
        throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
      }
      if (current.version !== args.expectedVersion) {
        throw new OrderError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }

      const shippingAddressId =
        args.shippingAddressId !== undefined
          ? asUuidOrNull(args.shippingAddressId)
          : current.shippingAddressId;
      const notes = args.notes !== undefined ? args.notes : current.notes;
      const totals = args.totals ?? {
        subtotalMinor: current.subtotalMinor,
        discountMinor: current.discountMinor,
        taxMinor: current.taxMinor,
        shippingMinor: current.shippingMinor,
        feeMinor: current.feeMinor,
        grandTotalMinor: current.grandTotalMinor
      };
      const fingerprint = args.duplicateFingerprint ?? current.duplicateFingerprint;

      const updated = await sql<OrderRow>`
        update app.orders
        set shipping_address_id = ${shippingAddressId}::uuid,
            notes = ${notes},
            subtotal_minor = ${totals.subtotalMinor},
            discount_minor = ${totals.discountMinor},
            tax_minor = ${totals.taxMinor},
            shipping_minor = ${totals.shippingMinor},
            fee_minor = ${totals.feeMinor},
            grand_total_minor = ${totals.grandTotalMinor},
            quote_version = ${args.quoteVersion},
            duplicate_fingerprint = ${fingerprint},
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.orderId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and version = ${args.expectedVersion}
        returning id, tenant_id, order_code, customer_id, conversation_id, status, currency,
                  subtotal_minor, discount_minor, tax_minor, shipping_minor, fee_minor,
                  grand_total_minor, quote_version, reservation_id, duplicate_fingerprint,
                  shipping_address_id, notes, version, created_at, updated_at
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new OrderError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }

      if (args.itemRows) {
        await this.replaceItems(trx, args.tenantId, args.orderId, args.itemRows);
      }

      const loaded = await this.loadOrder(trx, args.tenantId, args.orderId);
      if (!loaded) {
        throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
      }
      return loaded;
    });
  }

  async setReservation(args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly reservationId: string;
    readonly actorId: string;
  }): Promise<OrderRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadOrder(trx, args.tenantId, args.orderId);
      if (!current) {
        throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
      }
      const from = current.status;
      await sql`
        update app.orders
        set reservation_id = ${args.reservationId}::uuid,
            status = 'reserved',
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.orderId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      await this.appendHistory(trx, {
        tenantId: args.tenantId,
        orderId: args.orderId,
        statusFrom: from,
        statusTo: "reserved",
        reason: "inventory_reserved",
        actorId: args.actorId
      });
      const loaded = await this.loadOrder(trx, args.tenantId, args.orderId);
      if (!loaded) {
        throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
      }
      return loaded;
    });
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
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadOrder(trx, args.tenantId, args.orderId);
      if (!current) {
        throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
      }
      if (current.version !== args.expectedVersion) {
        throw new OrderError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const from = current.status;
      const updated = await sql<{ id: string }>`
        update app.orders
        set status = 'confirmed',
            subtotal_minor = ${args.totals.subtotalMinor},
            discount_minor = ${args.totals.discountMinor},
            tax_minor = ${args.totals.taxMinor},
            shipping_minor = ${args.totals.shippingMinor},
            fee_minor = ${args.totals.feeMinor},
            grand_total_minor = ${args.totals.grandTotalMinor},
            quote_version = ${args.quoteVersion},
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.orderId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and version = ${args.expectedVersion}
        returning id
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new OrderError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }

      await this.replaceItems(
        trx,
        args.tenantId,
        args.orderId,
        args.snapshotItems.map((i) => ({
          itemId: i.id,
          variantId: i.variantId,
          skuSnapshot: i.skuSnapshot,
          unitPriceMinor: i.unitPriceMinor,
          unitCostMinor: i.unitCostMinor,
          quantity: i.quantity,
          calc: {
            lineSubtotalMinor: i.lineSubtotalMinor,
            lineDiscountMinor: i.lineDiscountMinor,
            lineTaxMinor: i.lineTaxMinor,
            lineTotalMinor: i.lineTotalMinor
          }
        }))
      );
      await this.appendHistory(trx, {
        tenantId: args.tenantId,
        orderId: args.orderId,
        statusFrom: from,
        statusTo: "confirmed",
        reason: "confirmed",
        actorId: args.actorId
      });
      const loaded = await this.loadOrder(trx, args.tenantId, args.orderId);
      if (!loaded) {
        throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
      }
      return loaded;
    });
  }

  async cancelOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly actorId: string;
    readonly expectedVersion: number;
    readonly reason: string;
  }): Promise<OrderRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadOrder(trx, args.tenantId, args.orderId);
      if (!current) {
        throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
      }
      if (current.version !== args.expectedVersion) {
        throw new OrderError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const from = current.status;
      const updated = await sql<{ id: string }>`
        update app.orders
        set status = 'cancelled',
            reservation_id = null,
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.orderId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and version = ${args.expectedVersion}
        returning id
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new OrderError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      await this.appendHistory(trx, {
        tenantId: args.tenantId,
        orderId: args.orderId,
        statusFrom: from,
        statusTo: "cancelled",
        reason: args.reason,
        actorId: args.actorId
      });
      const loaded = await this.loadOrder(trx, args.tenantId, args.orderId);
      if (!loaded) {
        throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
      }
      return loaded;
    });
  }

  async expireOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly actorId: string;
  }): Promise<OrderRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadOrder(trx, args.tenantId, args.orderId);
      if (!current) {
        throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
      }
      const from = current.status;
      await sql`
        update app.orders
        set status = 'expired',
            reservation_id = null,
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.orderId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      await this.appendHistory(trx, {
        tenantId: args.tenantId,
        orderId: args.orderId,
        statusFrom: from,
        statusTo: "expired",
        reason: "expired",
        actorId: args.actorId
      });
      const loaded = await this.loadOrder(trx, args.tenantId, args.orderId);
      if (!loaded) {
        throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
      }
      return loaded;
    });
  }

  async listHistory(args: {
    readonly tenantId: string;
    readonly orderId: string;
  }): Promise<readonly OrderHistoryRecord[]> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const order = await sql<{ id: string }>`
        select id from app.orders
        where id = ${args.orderId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      if (!order.rows[0]) return [];
      const result = await sql<HistoryRow>`
        select id, tenant_id, order_id, status_from, status_to, reason, actor_id, occurred_at
        from app.order_status_history
        where tenant_id = ${args.tenantId}::uuid and order_id = ${args.orderId}::uuid
        order by occurred_at asc
      `.execute(trx);
      return result.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        orderId: row.order_id,
        statusFrom: row.status_from,
        statusTo: row.status_to,
        reason: row.reason,
        actorId: row.actor_id,
        occurredAt: row.occurred_at.toISOString()
      }));
    });
  }

  async getIdempotentOrder(tenantId: string, key: string): Promise<OrderRecord | null> {
    return this.idempotentOrders.get(this.idemKey(tenantId, key)) ?? null;
  }

  async rememberIdempotentOrder(tenantId: string, key: string, order: OrderRecord): Promise<void> {
    this.idempotentOrders.set(this.idemKey(tenantId, key), order);
  }

  async getIdempotentCommand(tenantId: string, key: string): Promise<OrderRecord | null> {
    return this.idempotentCommands.get(this.idemKey(tenantId, key)) ?? null;
  }

  async rememberIdempotentCommand(tenantId: string, key: string, order: OrderRecord): Promise<void> {
    this.idempotentCommands.set(this.idemKey(tenantId, key), order);
  }
}
