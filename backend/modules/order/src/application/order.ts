import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { buildOrderFingerprint } from "../domain/fingerprint.js";
import {
  calculateOrderTotals,
  TAX_RATE_BPS,
  type CalculatedLineItem
} from "../domain/order-calculation.js";

/**
 * BE-ORD-001…008 — Order application layer (draft, calc, reserve, confirm, cancel).
 * In-memory until Postgres adapter. Mirrors inventory/conversation style.
 */

export type OrderPermission =
  | "order.read"
  | "order.create"
  | "order.confirm"
  | "order.cancel"
  | "inventory.reserve"
  | "internal.order.confirm";

export type OrderStatus = "draft" | "reserved" | "confirmed" | "cancelled" | "expired";

export type OrderErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_VERSION_MISMATCH"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "ORDER_STATE_INVALID"
  | "ORDER_QUOTE_STALE"
  | "ORDER_TOTAL_CHANGED"
  | "ORDER_DUPLICATE_SUSPECTED"
  | "ORDER_CANCELLATION_NOT_ALLOWED"
  | "INVENTORY_RESERVATION_STATE_INVALID"
  | "INVENTORY_RESERVATION_OWNER_MISMATCH";

export class OrderError extends Error {
  constructor(
    message: string,
    readonly code: OrderErrorCode
  ) {
    super(message);
    this.name = "OrderError";
  }
}

export interface OrderResource {
  readonly id: string;
  readonly tenant_id: string;
  readonly order_code: string;
  readonly customer_id: string;
  readonly status: OrderStatus;
  readonly currency: string;
  readonly subtotal_minor?: number;
  readonly discount_minor?: number;
  readonly tax_minor?: number;
  readonly grand_total_minor: number;
  readonly tax_rate_bps: number;
  readonly prices_tax_inclusive: true;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface OrderItemRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly orderId: string;
  readonly variantId: string;
  readonly skuSnapshot: string | null;
  readonly unitPriceMinor: number;
  readonly unitCostMinor: number | null;
  readonly quantity: string;
  readonly lineSubtotalMinor: number;
  readonly lineDiscountMinor: number;
  readonly lineTaxMinor: number;
  readonly lineTotalMinor: number;
}

export interface OrderHistoryRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly orderId: string;
  readonly statusFrom: string | null;
  readonly statusTo: string;
  readonly reason: string | null;
  readonly actorId: string | null;
  readonly occurredAt: string;
}

export interface OrderRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly orderCode: string;
  readonly customerId: string;
  readonly conversationId: string | null;
  readonly status: OrderStatus;
  readonly currency: string;
  readonly subtotalMinor: number;
  readonly discountMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly feeMinor: number;
  readonly grandTotalMinor: number;
  readonly quoteVersion: string;
  readonly reservationId: string | null;
  readonly duplicateFingerprint: string | null;
  readonly shippingAddressId: string | null;
  readonly notes: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly items: readonly OrderItemRecord[];
}

export interface CatalogPricingPort {
  getVariantPricing(args: {
    readonly tenantId: string;
    readonly variantId: string;
  }): Promise<{
    readonly unitPriceMinor: number;
    readonly currency: string;
    readonly costMinor: number | null;
    readonly sku: string | null;
  } | null>;
}

export interface ReservationPort {
  createReservation(args: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly orderId: string;
    readonly idempotencyKey: string;
    readonly expiresAt: string;
    readonly items: readonly { readonly variantId: string; readonly quantity: string }[];
  }): Promise<{ readonly reservationId: string }>;

  convertReservation(args: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly reservationId: string;
    readonly orderId: string;
    readonly idempotencyKey: string;
  }): Promise<void>;

  releaseReservation(args: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly reservationId: string;
    readonly idempotencyKey: string;
  }): Promise<void>;
}

export interface OrderRepository {
  listOrders(tenantId: string): Promise<readonly OrderRecord[]>;
  getOrder(args: { readonly tenantId: string; readonly orderId: string }): Promise<OrderRecord | null>;
  findByFingerprint(args: {
    readonly tenantId: string;
    readonly fingerprint: string;
    readonly withinHours?: number;
  }): Promise<OrderRecord | null>;

  createOrderDraft(args: {
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
      readonly calc: CalculatedLineItem;
    }[];
    readonly idempotencyKey: string;
  }): Promise<OrderRecord>;

  updateOrderDraft(args: {
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
      readonly calc: CalculatedLineItem;
    }[];
    readonly quoteVersion: string;
    readonly duplicateFingerprint?: string;
  }): Promise<OrderRecord>;

  setReservation(args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly reservationId: string;
    readonly actorId: string;
  }): Promise<OrderRecord>;

  confirmOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly actorId: string;
    readonly expectedVersion: number;
    readonly quoteVersion: string;
    readonly totals: ReturnType<typeof calculateOrderTotals>;
    readonly snapshotItems: readonly OrderItemRecord[];
  }): Promise<OrderRecord>;

  cancelOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly actorId: string;
    readonly expectedVersion: number;
    readonly reason: string;
  }): Promise<OrderRecord>;

  expireOrder(args: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly actorId: string;
  }): Promise<OrderRecord>;

  listHistory(args: {
    readonly tenantId: string;
    readonly orderId: string;
  }): Promise<readonly OrderHistoryRecord[]>;

  getIdempotentOrder(tenantId: string, key: string): Promise<OrderRecord | null>;
  rememberIdempotentOrder(tenantId: string, key: string, order: OrderRecord): Promise<void>;
  getIdempotentCommand(tenantId: string, key: string): Promise<OrderRecord | null>;
  rememberIdempotentCommand(tenantId: string, key: string, order: OrderRecord): Promise<void>;
}

export function requireOrderPermission(
  actorPermissions: readonly string[],
  permission: OrderPermission
): void {
  if (!actorPermissions.includes(permission)) {
    throw new OrderError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

export function parseQuantity(value: string | undefined | null): number {
  if (value == null || !value.trim()) {
    throw new OrderError("Quantity is required.", "VALIDATION_FAILED");
  }
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new OrderError("Invalid quantity format.", "VALIDATION_FAILED");
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) {
    throw new OrderError("Invalid quantity.", "VALIDATION_FAILED");
  }
  return num;
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

function toOrderResponse(order: OrderRecord): Record<string, unknown> {
  return {
    id: order.id,
    tenant_id: order.tenantId,
    order_code: order.orderCode,
    customer_id: order.customerId,
    status: order.status,
    currency: order.currency,
    subtotal_minor: order.subtotalMinor,
    discount_minor: order.discountMinor,
    tax_minor: order.taxMinor,
    grand_total_minor: order.grandTotalMinor,
    tax_rate_bps: TAX_RATE_BPS,
    prices_tax_inclusive: true as const,
    version: order.version,
    created_at: order.createdAt,
    updated_at: order.updatedAt
  };
}

async function resolveLinePricing(options: {
  readonly catalog: CatalogPricingPort;
  readonly tenantId: string;
  readonly items: readonly { readonly variant_id: string; readonly quantity: string }[];
  readonly currency: string;
}): Promise<{
  readonly inputs: readonly OrderLineInput[];
  readonly rows: readonly {
    readonly variantId: string;
    readonly skuSnapshot: string | null;
    readonly unitPriceMinor: number;
    readonly unitCostMinor: number | null;
    readonly quantity: string;
    readonly quantityNum: number;
  }[];
}> {
  const rows: {
    variantId: string;
    skuSnapshot: string | null;
    unitPriceMinor: number;
    unitCostMinor: number | null;
    quantity: string;
    quantityNum: number;
  }[] = [];

  for (const item of options.items) {
    const pricing = await options.catalog.getVariantPricing({
      tenantId: options.tenantId,
      variantId: item.variant_id
    });
    if (!pricing) {
      throw new OrderError(`Variant ${item.variant_id} not found.`, "RESOURCE_NOT_FOUND");
    }
    if (pricing.currency !== options.currency) {
      throw new OrderError("Currency mismatch with catalog.", "VALIDATION_FAILED");
    }
    const quantityNum = parseQuantity(item.quantity);
    rows.push({
      variantId: item.variant_id,
      skuSnapshot: pricing.sku,
      unitPriceMinor: pricing.unitPriceMinor,
      unitCostMinor: pricing.costMinor,
      quantity: item.quantity.trim(),
      quantityNum
    });
  }

  return {
    inputs: rows.map((r) => ({
      variantId: r.variantId,
      quantity: r.quantityNum,
      unitPriceMinor: r.unitPriceMinor
    })),
    rows
  };
}

type OrderLineInput = import("../domain/order-calculation.js").OrderLineInput;

async function buildTotalsFromItems(options: {
  readonly catalog: CatalogPricingPort;
  readonly tenantId: string;
  readonly currency: string;
  readonly items: readonly { readonly variant_id: string; readonly quantity: string }[];
}) {
  const resolved = await resolveLinePricing(options);
  const totals = calculateOrderTotals({ items: resolved.inputs });
  return { totals, rows: resolved.rows };
}

function nextQuoteVersion(): string {
  return `qv_${Date.now()}`;
}

export async function listOrders(options: {
  readonly repo: OrderRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireOrderPermission(options.actorPermissions, "order.read");
  const rows = await options.repo.listOrders(options.tenantId);
  return {
    data: rows.map(toOrderResponse),
    page_info: emptyPage(),
    meta: {}
  };
}

export async function createOrderDraft(options: {
  readonly repo: OrderRepository;
  readonly catalog: CatalogPricingPort;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly customerId: string;
  readonly conversationId?: string | null;
  readonly currency?: string;
  readonly items: readonly { readonly variant_id: string; readonly quantity: string }[];
  readonly shippingAddressId?: string | null;
  readonly notes?: string | null;
  readonly rejectDuplicate?: boolean;
}) {
  requireOrderPermission(options.actorPermissions, "order.create");
  if (!options.idempotencyKey?.trim()) {
    throw new OrderError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const cached = await options.repo.getIdempotentOrder(options.tenantId, key);
  if (cached) {
    return { data: toOrderResponse(cached), meta: {}, version: cached.version };
  }
  if (!options.customerId?.trim() || !options.items?.length) {
    throw new OrderError("customer_id and items are required.", "VALIDATION_FAILED");
  }
  const currency = (options.currency ?? "VND").trim().toUpperCase();
  const fingerprint = buildOrderFingerprint({
    customerId: options.customerId,
    items: options.items.map((i) => ({ variantId: i.variant_id, quantity: i.quantity }))
  });
  const duplicate = await options.repo.findByFingerprint({
    tenantId: options.tenantId,
    fingerprint
  });
  if (duplicate && options.rejectDuplicate) {
    throw new OrderError("Duplicate order suspected.", "ORDER_DUPLICATE_SUSPECTED");
  }
  const { totals, rows } = await buildTotalsFromItems({
    catalog: options.catalog,
    tenantId: options.tenantId,
    currency,
    items: options.items
  });
  const quoteVersion = nextQuoteVersion();
  const order = await options.repo.createOrderDraft({
    tenantId: options.tenantId,
    orderId: generateUuidV7(),
    actorId: options.actorId,
    customerId: options.customerId,
    conversationId: options.conversationId ?? null,
    currency,
    shippingAddressId: options.shippingAddressId ?? null,
    notes: options.notes?.trim() ?? null,
    duplicateFingerprint: fingerprint,
    quoteVersion,
    totals,
    items: rows.map((r) => ({
      itemId: generateUuidV7(),
      variantId: r.variantId,
      skuSnapshot: r.skuSnapshot,
      unitPriceMinor: r.unitPriceMinor,
      unitCostMinor: r.unitCostMinor,
      quantity: r.quantity,
      calc: totals.lineItems.find((l) => l.variantId === r.variantId)!
    })),
    idempotencyKey: key
  });
  await options.repo.rememberIdempotentOrder(options.tenantId, key, order);
  const meta: Record<string, unknown> = {};
  if (duplicate) {
    meta.duplicate_suspected = true;
    meta.duplicate_order_id = duplicate.id;
  }
  return { data: toOrderResponse(order), meta, version: order.version };
}

export async function getOrder(options: {
  readonly repo: OrderRepository;
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireOrderPermission(options.actorPermissions, "order.read");
  const order = await options.repo.getOrder({
    tenantId: options.tenantId,
    orderId: options.orderId
  });
  if (!order) {
    throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
  }
  return { data: toOrderResponse(order), meta: {}, version: order.version };
}

export async function updateOrderDraft(options: {
  readonly repo: OrderRepository;
  readonly catalog: CatalogPricingPort;
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly expectedVersion: number;
  readonly shippingAddressId?: string | null;
  readonly notes?: string | null;
  readonly items?: readonly { readonly variant_id: string; readonly quantity: string }[] | null;
}) {
  requireOrderPermission(options.actorPermissions, "order.create");
  const existing = await options.repo.getOrder({
    tenantId: options.tenantId,
    orderId: options.orderId
  });
  if (!existing) {
    throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
  }
  if (existing.status !== "draft") {
    throw new OrderError("Only draft orders can be updated.", "ORDER_STATE_INVALID");
  }
  if (existing.version !== options.expectedVersion) {
    throw new OrderError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
  }

  let totals = calculateOrderTotals({
    items: existing.items.map((i) => ({
      variantId: i.variantId,
      quantity: parseQuantity(i.quantity),
      unitPriceMinor: i.unitPriceMinor
    }))
  });
  let itemRows:
    | readonly {
        readonly itemId: UuidV7;
        readonly variantId: string;
        readonly skuSnapshot: string | null;
        readonly unitPriceMinor: number;
        readonly unitCostMinor: number | null;
        readonly quantity: string;
        readonly calc: CalculatedLineItem;
      }[]
    | undefined;
  let fingerprint = existing.duplicateFingerprint ?? undefined;

  if (options.items) {
    const built = await buildTotalsFromItems({
      catalog: options.catalog,
      tenantId: options.tenantId,
      currency: existing.currency,
      items: options.items
    });
    totals = built.totals;
    fingerprint = buildOrderFingerprint({
      customerId: existing.customerId,
      items: options.items.map((i) => ({ variantId: i.variant_id, quantity: i.quantity }))
    });
    itemRows = built.rows.map((r) => ({
      itemId: generateUuidV7(),
      variantId: r.variantId,
      skuSnapshot: r.skuSnapshot,
      unitPriceMinor: r.unitPriceMinor,
      unitCostMinor: r.unitCostMinor,
      quantity: r.quantity,
      calc: totals.lineItems.find((l) => l.variantId === r.variantId)!
    }));
  }

  const order = await options.repo.updateOrderDraft({
    tenantId: options.tenantId,
    orderId: options.orderId,
    actorId: options.actorId,
    expectedVersion: options.expectedVersion,
    quoteVersion: nextQuoteVersion(),
    ...(options.shippingAddressId !== undefined ? { shippingAddressId: options.shippingAddressId } : {}),
    ...(options.notes !== undefined ? { notes: options.notes } : {}),
    ...(options.items && itemRows
      ? {
          items: options.items.map((i) => ({ variantId: i.variant_id, quantity: i.quantity })),
          totals,
          itemRows
        }
      : {}),
    ...(fingerprint ? { duplicateFingerprint: fingerprint } : {})
  });
  return { data: toOrderResponse(order), meta: {}, version: order.version };
}

export async function recalculateOrder(options: {
  readonly repo: OrderRepository;
  readonly catalog: CatalogPricingPort;
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  requireOrderPermission(options.actorPermissions, "order.create");
  if (!options.idempotencyKey?.trim()) {
    throw new OrderError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const cached = await options.repo.getIdempotentCommand(options.tenantId, key);
  if (cached) {
    return { data: toOrderResponse(cached), meta: {}, version: cached.version };
  }
  const existing = await options.repo.getOrder({
    tenantId: options.tenantId,
    orderId: options.orderId
  });
  if (!existing) {
    throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
  }
  if (existing.status !== "draft" && existing.status !== "reserved") {
    throw new OrderError("Order cannot be recalculated.", "ORDER_STATE_INVALID");
  }
  const items = existing.items.map((i) => ({
    variant_id: i.variantId,
    quantity: i.quantity
  }));
  const { totals, rows } = await buildTotalsFromItems({
    catalog: options.catalog,
    tenantId: options.tenantId,
    currency: existing.currency,
    items
  });
  const order = await options.repo.updateOrderDraft({
    tenantId: options.tenantId,
    orderId: options.orderId,
    actorId: options.actorId,
    expectedVersion: existing.version,
    items: items.map((i) => ({ variantId: i.variant_id, quantity: i.quantity })),
    totals,
    itemRows: rows.map((r) => ({
      itemId: generateUuidV7(),
      variantId: r.variantId,
      skuSnapshot: r.skuSnapshot,
      unitPriceMinor: r.unitPriceMinor,
      unitCostMinor: r.unitCostMinor,
      quantity: r.quantity,
      calc: totals.lineItems.find((l) => l.variantId === r.variantId)!
    })),
    quoteVersion: nextQuoteVersion()
  });
  await options.repo.rememberIdempotentCommand(options.tenantId, key, order);
  return { data: toOrderResponse(order), meta: {}, version: order.version };
}

export async function reserveOrderInventory(options: {
  readonly repo: OrderRepository;
  readonly reservation: ReservationPort;
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly expiresAt?: string;
}) {
  requireOrderPermission(options.actorPermissions, "inventory.reserve");
  if (!options.idempotencyKey?.trim()) {
    throw new OrderError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const cached = await options.repo.getIdempotentCommand(options.tenantId, key);
  if (cached) {
    return { data: toOrderResponse(cached), meta: {} };
  }
  const existing = await options.repo.getOrder({
    tenantId: options.tenantId,
    orderId: options.orderId
  });
  if (!existing) {
    throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
  }
  if (existing.status !== "draft") {
    throw new OrderError("Only draft orders can be reserved.", "ORDER_STATE_INVALID");
  }
  const expiresAt =
    options.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { reservationId } = await options.reservation.createReservation({
    tenantId: options.tenantId,
    actorId: options.actorId,
    orderId: options.orderId,
    idempotencyKey: key,
    expiresAt,
    items: existing.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }))
  });
  const order = await options.repo.setReservation({
    tenantId: options.tenantId,
    orderId: options.orderId,
    reservationId,
    actorId: options.actorId
  });
  await options.repo.rememberIdempotentCommand(options.tenantId, key, order);
  return { data: toOrderResponse(order), meta: {} };
}

export async function confirmOrder(options: {
  readonly repo: OrderRepository;
  readonly catalog: CatalogPricingPort;
  readonly reservation: ReservationPort;
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly expectedOrderVersion: number;
  readonly quoteVersion: string;
  readonly reservationId: string;
}) {
  requireOrderPermission(options.actorPermissions, "order.confirm");
  if (!options.idempotencyKey?.trim()) {
    throw new OrderError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const cached = await options.repo.getIdempotentCommand(options.tenantId, key);
  if (cached) {
    return { data: toOrderResponse(cached), meta: {} };
  }
  const existing = await options.repo.getOrder({
    tenantId: options.tenantId,
    orderId: options.orderId
  });
  if (!existing) {
    throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
  }
  if (existing.status !== "draft" && existing.status !== "reserved") {
    throw new OrderError("Order cannot be confirmed.", "ORDER_STATE_INVALID");
  }
  if (existing.version !== options.expectedOrderVersion) {
    throw new OrderError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
  }
  if (existing.quoteVersion !== options.quoteVersion) {
    throw new OrderError("Quote is stale.", "ORDER_QUOTE_STALE");
  }
  if (!existing.reservationId || existing.reservationId !== options.reservationId) {
    throw new OrderError("Reservation mismatch.", "INVENTORY_RESERVATION_OWNER_MISMATCH");
  }

  const items = existing.items.map((i) => ({
    variant_id: i.variantId,
    quantity: i.quantity
  }));
  const { totals, rows } = await buildTotalsFromItems({
    catalog: options.catalog,
    tenantId: options.tenantId,
    currency: existing.currency,
    items
  });
  if (totals.grandTotalMinor !== existing.grandTotalMinor) {
    throw new OrderError("Order total changed.", "ORDER_TOTAL_CHANGED");
  }

  await options.reservation.convertReservation({
    tenantId: options.tenantId,
    actorId: options.actorId,
    reservationId: options.reservationId,
    orderId: options.orderId,
    idempotencyKey: `${key}:convert`
  });

  const snapshotItems: OrderItemRecord[] = rows.map((r, idx) => {
    const calc = totals.lineItems.find((l) => l.variantId === r.variantId)!;
    const prior = existing.items[idx];
    return {
      id: prior?.id ?? generateUuidV7(),
      tenantId: options.tenantId,
      orderId: options.orderId,
      variantId: r.variantId,
      skuSnapshot: r.skuSnapshot,
      unitPriceMinor: r.unitPriceMinor,
      unitCostMinor: r.unitCostMinor,
      quantity: r.quantity,
      lineSubtotalMinor: calc.lineSubtotalMinor,
      lineDiscountMinor: calc.lineDiscountMinor,
      lineTaxMinor: calc.lineTaxMinor,
      lineTotalMinor: calc.lineTotalMinor
    };
  });

  const order = await options.repo.confirmOrder({
    tenantId: options.tenantId,
    orderId: options.orderId,
    actorId: options.actorId,
    expectedVersion: options.expectedOrderVersion,
    quoteVersion: options.quoteVersion,
    totals,
    snapshotItems
  });
  await options.repo.rememberIdempotentCommand(options.tenantId, key, order);
  return { data: toOrderResponse(order), meta: {} };
}

export async function cancelOrder(options: {
  readonly repo: OrderRepository;
  readonly reservation: ReservationPort;
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly expectedVersion: number;
  readonly reason: string;
}) {
  requireOrderPermission(options.actorPermissions, "order.cancel");
  if (!options.idempotencyKey?.trim()) {
    throw new OrderError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const cached = await options.repo.getIdempotentCommand(options.tenantId, key);
  if (cached) {
    return { data: toOrderResponse(cached), meta: {} };
  }
  const existing = await options.repo.getOrder({
    tenantId: options.tenantId,
    orderId: options.orderId
  });
  if (!existing) {
    throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
  }
  if (existing.status === "confirmed") {
    throw new OrderError("Confirmed orders cannot be cancelled here.", "ORDER_CANCELLATION_NOT_ALLOWED");
  }
  if (existing.status === "cancelled" || existing.status === "expired") {
    throw new OrderError("Order already terminal.", "ORDER_STATE_INVALID");
  }
  if (existing.version !== options.expectedVersion) {
    throw new OrderError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
  }
  if (existing.reservationId) {
    await options.reservation.releaseReservation({
      tenantId: options.tenantId,
      actorId: options.actorId,
      reservationId: existing.reservationId,
      idempotencyKey: `${key}:release`
    });
  }
  const order = await options.repo.cancelOrder({
    tenantId: options.tenantId,
    orderId: options.orderId,
    actorId: options.actorId,
    expectedVersion: options.expectedVersion,
    reason: options.reason.trim()
  });
  await options.repo.rememberIdempotentCommand(options.tenantId, key, order);
  return { data: toOrderResponse(order), meta: {} };
}

export async function expireOrder(options: {
  readonly repo: OrderRepository;
  readonly reservation: ReservationPort;
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  if (!options.actorPermissions.includes("internal.system")) {
    throw new OrderError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
  if (!options.idempotencyKey?.trim()) {
    throw new OrderError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const cached = await options.repo.getIdempotentCommand(options.tenantId, key);
  if (cached) {
    return { data: toOrderResponse(cached), meta: {} };
  }
  const existing = await options.repo.getOrder({
    tenantId: options.tenantId,
    orderId: options.orderId
  });
  if (!existing) {
    throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
  }
  if (existing.reservationId) {
    await options.reservation.releaseReservation({
      tenantId: options.tenantId,
      actorId: options.actorId,
      reservationId: existing.reservationId,
      idempotencyKey: `${key}:release`
    });
  }
  const order = await options.repo.expireOrder({
    tenantId: options.tenantId,
    orderId: options.orderId,
    actorId: options.actorId
  });
  await options.repo.rememberIdempotentCommand(options.tenantId, key, order);
  return { data: toOrderResponse(order), meta: {} };
}

export async function getOrderHistory(options: {
  readonly repo: OrderRepository;
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireOrderPermission(options.actorPermissions, "order.read");
  const order = await options.repo.getOrder({
    tenantId: options.tenantId,
    orderId: options.orderId
  });
  if (!order) {
    throw new OrderError("Order not found.", "RESOURCE_NOT_FOUND");
  }
  const history = await options.repo.listHistory({
    tenantId: options.tenantId,
    orderId: options.orderId
  });
  return {
    data: toOrderResponse(order),
    meta: {
      history: history.map((h) => ({
        id: h.id,
        status_from: h.statusFrom,
        status_to: h.statusTo,
        reason: h.reason,
        occurred_at: h.occurredAt
      }))
    }
  };
}

export { calculateOrderTotals, TAX_RATE_BPS, roundHalfUp, extractInclusiveTaxMinor } from "../domain/order-calculation.js";
export { buildOrderFingerprint } from "../domain/fingerprint.js";
