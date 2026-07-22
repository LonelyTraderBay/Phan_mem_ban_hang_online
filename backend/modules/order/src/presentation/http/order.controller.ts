import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Body,
  Res,
  UnprocessableEntityException
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { DomainInvariantError, parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { MissingSecurityContextError } from "@ai-sales/security";
import type { IdempotencyStore } from "@ai-sales/idempotency";
import {
  cancelOrder,
  confirmOrder,
  createOrderDraft,
  expireOrder,
  formatEtag,
  getOrder,
  getOrderHistory,
  listOrders,
  OrderError,
  parseIfMatchVersion,
  recalculateOrder,
  reserveOrderInventory,
  updateOrderDraft,
  type CatalogPricingPort,
  type OrderRepository,
  type ReservationPort
} from "../../application/order.js";

type HeaderBag = Record<string, string | string[] | undefined>;

function headerValue(headers: HeaderBag, name: string): string {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new MissingSecurityContextError(name);
  }
  return raw.trim();
}

function optionalHeader(headers: HeaderBag, name: string): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function parseActor(headers: HeaderBag): {
  actorId: UuidV7;
  tenantId: string;
  permissions: string[];
} {
  try {
    const actorId = parseUuidV7(headerValue(headers, "x-actor-id"));
    const tenantId = headerValue(headers, "x-tenant-id");
    const permissions = (optionalHeader(headers, "x-permissions") ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    return { actorId, tenantId, permissions };
  } catch (error) {
    if (error instanceof MissingSecurityContextError || error instanceof DomainInvariantError) {
      throw new ForbiddenException({ code: "AUTH_UNAUTHORIZED", message: "Actor context required." });
    }
    throw error;
  }
}

function resolveExpectedVersion(headers: HeaderBag, bodyExpectedVersion: number | undefined): number {
  const fromHeader = parseIfMatchVersion(optionalHeader(headers, "if-match"));
  if (fromHeader !== null) return fromHeader;
  if (typeof bodyExpectedVersion === "number") return bodyExpectedVersion;
  throw new UnprocessableEntityException({
    code: "VALIDATION_FAILED",
    message: "expected_version or If-Match header is required."
  });
}

function mapOrderError(error: unknown): never {
  if (error instanceof OrderError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "RESOURCE_NOT_FOUND":
        throw new HttpException({ code: error.code, message: error.message }, 404);
      case "RESOURCE_VERSION_MISMATCH":
        throw new HttpException({ code: error.code, message: error.message }, 412);
      case "IDEMPOTENCY_KEY_REQUIRED":
        throw new BadRequestException({ code: error.code, message: error.message });
      case "ORDER_STATE_INVALID":
      case "ORDER_QUOTE_STALE":
      case "ORDER_TOTAL_CHANGED":
      case "ORDER_DUPLICATE_SUSPECTED":
      case "ORDER_CANCELLATION_NOT_ALLOWED":
      case "INVENTORY_RESERVATION_STATE_INVALID":
      case "INVENTORY_RESERVATION_OWNER_MISMATCH":
        throw new HttpException({ code: error.code, message: error.message }, 409);
      case "VALIDATION_FAILED":
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createOrderController(options: {
  readonly repo: OrderRepository;
  readonly catalog: CatalogPricingPort;
  readonly reservation: ReservationPort;
  readonly idempotency?: IdempotencyStore;
}) {
  @Controller("api/v1")
  class OrderController {
    @Get("orders")
    async listOrdersRoute(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listOrders({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapOrderError(error);
      }
    }

    @Post("orders")
    @HttpCode(HttpStatus.CREATED)
    async createOrderRoute(
      @Body()
      body: {
        customer_id?: string;
        conversation_id?: string | null;
        currency?: string;
        items?: { variant_id: string; quantity: string }[];
        shipping_address_id?: string | null;
        notes?: string | null;
      },
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const actor = parseActor(headers);
        const result = await createOrderDraft({
          repo: options.repo,
          catalog: options.catalog,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          customerId: body?.customer_id ?? "",
          ...(body?.conversation_id !== undefined ? { conversationId: body.conversation_id } : {}),
          ...(body?.currency !== undefined ? { currency: body.currency } : {}),
          items: body?.items ?? [],
          ...(body?.shipping_address_id !== undefined
            ? { shippingAddressId: body.shipping_address_id }
            : {}),
          ...(body?.notes !== undefined ? { notes: body.notes } : {})
        });
        reply.header("ETag", formatEtag(result.version));
        if (result.meta.duplicate_suspected) {
          reply.header("X-Duplicate-Order-Warning", "fingerprint-match");
        }
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapOrderError(error);
      }
    }

    @Get("orders/:order_id")
    async getOrderRoute(@Param("order_id") orderId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        const result = await getOrder({
          repo: options.repo,
          tenantId: actor.tenantId,
          orderId,
          actorPermissions: actor.permissions
        });
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapOrderError(error);
      }
    }

    @Patch("orders/:order_id")
    async updateOrderRoute(
      @Param("order_id") orderId: string,
      @Body()
      body: {
        expected_version?: number;
        shipping_address_id?: string | null;
        notes?: string | null;
        items?: { variant_id: string; quantity: string }[] | null;
      },
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const actor = parseActor(headers);
        const result = await updateOrderDraft({
          repo: options.repo,
          catalog: options.catalog,
          tenantId: actor.tenantId,
          orderId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          expectedVersion: resolveExpectedVersion(headers, body?.expected_version),
          ...(body?.shipping_address_id !== undefined
            ? { shippingAddressId: body.shipping_address_id }
            : {}),
          ...(body?.notes !== undefined ? { notes: body.notes } : {}),
          ...(body?.items !== undefined ? { items: body.items } : {})
        });
        reply.header("ETag", formatEtag(result.version));
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapOrderError(error);
      }
    }

    @Post("orders/:order_id/recalculate")
    async recalculateRoute(@Param("order_id") orderId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        const result = await recalculateOrder({
          repo: options.repo,
          catalog: options.catalog,
          tenantId: actor.tenantId,
          orderId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {})
        });
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapOrderError(error);
      }
    }

    @Post("orders/:order_id/reserve")
    async reserveRoute(@Param("order_id") orderId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await reserveOrderInventory({
          repo: options.repo,
          reservation: options.reservation,
          tenantId: actor.tenantId,
          orderId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {})
        });
      } catch (error) {
        mapOrderError(error);
      }
    }

    @Post("orders/:order_id/confirm")
    async confirmRoute(
      @Param("order_id") orderId: string,
      @Body()
      body: {
        expected_order_version?: number;
        quote_version?: string;
        reservation_id?: string;
        customer_confirmation?: { source?: string; confirmed_at?: string };
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await confirmOrder({
          repo: options.repo,
          catalog: options.catalog,
          reservation: options.reservation,
          tenantId: actor.tenantId,
          orderId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          expectedOrderVersion: body?.expected_order_version ?? 1,
          quoteVersion: body?.quote_version ?? "",
          reservationId: body?.reservation_id ?? ""
        });
      } catch (error) {
        mapOrderError(error);
      }
    }

    @Post("orders/:order_id/cancel")
    async cancelRoute(
      @Param("order_id") orderId: string,
      @Body() body: { expected_version?: number; reason?: string },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await cancelOrder({
          repo: options.repo,
          reservation: options.reservation,
          tenantId: actor.tenantId,
          orderId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          expectedVersion: body?.expected_version ?? resolveExpectedVersion(headers, undefined),
          reason: body?.reason ?? ""
        });
      } catch (error) {
        mapOrderError(error);
      }
    }

    @Post("orders/:order_id/expire")
    async expireRoute(@Param("order_id") orderId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await expireOrder({
          repo: options.repo,
          reservation: options.reservation,
          tenantId: actor.tenantId,
          orderId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {})
        });
      } catch (error) {
        mapOrderError(error);
      }
    }

    @Get("orders/:order_id/history")
    async historyRoute(@Param("order_id") orderId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getOrderHistory({
          repo: options.repo,
          tenantId: actor.tenantId,
          orderId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapOrderError(error);
      }
    }
  }

  return OrderController;
}
