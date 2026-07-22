import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Body,
  UnprocessableEntityException
} from "@nestjs/common";
import { DomainInvariantError, parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import type { IdempotencyStore } from "@ai-sales/idempotency";
import { MissingSecurityContextError } from "@ai-sales/security";
import {
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
  updateShipment,
  type FulfillmentRepository,
  type InventoryRestockPort,
  type OrderEligibilityPort
} from "../../application/fulfillment.js";

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

function mapFulfillmentError(error: unknown): never {
  if (error instanceof FulfillmentError) {
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
      case "RETURN_STATE_INVALID":
        throw new HttpException({ code: error.code, message: error.message }, 409);
      case "VALIDATION_FAILED":
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createFulfillmentController(options: {
  readonly repo: FulfillmentRepository;
  readonly orders: OrderEligibilityPort;
  readonly inventory?: InventoryRestockPort;
  readonly idempotency?: IdempotencyStore;
}) {
  @Controller("api/v1")
  class FulfillmentController {
    @Post("orders/:order_id/shipments")
    @HttpCode(HttpStatus.CREATED)
    async createShipmentRoute(
      @Param("order_id") orderId: string,
      @Body()
      body: {
        carrier?: string | null;
        tracking_code?: string | null;
        items?: { order_item_id: string; quantity: string }[];
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createShipment({
          repo: options.repo,
          orders: options.orders,
          tenantId: actor.tenantId,
          orderId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          ...(body?.carrier !== undefined ? { carrier: body.carrier } : {}),
          ...(body?.tracking_code !== undefined ? { trackingCode: body.tracking_code } : {}),
          items: body?.items ?? []
        });
      } catch (error) {
        mapFulfillmentError(error);
      }
    }

    @Patch("shipments/:shipment_id")
    async updateShipmentRoute(
      @Param("shipment_id") shipmentId: string,
      @Body()
      body: {
        expected_version?: number;
        carrier?: string | null;
        tracking_code?: string | null;
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await updateShipment({
          repo: options.repo,
          tenantId: actor.tenantId,
          shipmentId,
          actorPermissions: actor.permissions,
          expectedVersion: body?.expected_version ?? 1,
          ...(body?.carrier !== undefined ? { carrier: body.carrier } : {}),
          ...(body?.tracking_code !== undefined ? { trackingCode: body.tracking_code } : {})
        });
      } catch (error) {
        mapFulfillmentError(error);
      }
    }

    @Post("shipments/:shipment_id/mark-packed")
    async markPackedRoute(@Param("shipment_id") shipmentId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await markShipmentPacked({
          repo: options.repo,
          tenantId: actor.tenantId,
          shipmentId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {})
        });
      } catch (error) {
        mapFulfillmentError(error);
      }
    }

    @Post("shipments/:shipment_id/mark-shipped")
    async markShippedRoute(@Param("shipment_id") shipmentId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await markShipmentShipped({
          repo: options.repo,
          tenantId: actor.tenantId,
          shipmentId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {})
        });
      } catch (error) {
        mapFulfillmentError(error);
      }
    }

    @Post("shipments/:shipment_id/mark-delivered")
    async markDeliveredRoute(
      @Param("shipment_id") shipmentId: string,
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await markShipmentDelivered({
          repo: options.repo,
          tenantId: actor.tenantId,
          shipmentId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {})
        });
      } catch (error) {
        mapFulfillmentError(error);
      }
    }

    @Post("orders/:order_id/packing-slip-jobs")
    @HttpCode(HttpStatus.ACCEPTED)
    async packingSlipRoute(@Param("order_id") orderId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await createPackingSlipJob({
          tenantId: actor.tenantId,
          orderId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapFulfillmentError(error);
      }
    }

    @Post("orders/:order_id/returns")
    @HttpCode(HttpStatus.CREATED)
    async createReturnRoute(
      @Param("order_id") orderId: string,
      @Body()
      body: {
        reason?: string;
        items?: { order_item_id: string; quantity: string }[];
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createReturn({
          repo: options.repo,
          orders: options.orders,
          tenantId: actor.tenantId,
          orderId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          reason: body?.reason ?? "",
          items: body?.items ?? []
        });
      } catch (error) {
        mapFulfillmentError(error);
      }
    }

    @Post("returns/:return_id/approve")
    async approveReturnRoute(@Param("return_id") returnId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await approveReturn({
          repo: options.repo,
          tenantId: actor.tenantId,
          returnId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {})
        });
      } catch (error) {
        mapFulfillmentError(error);
      }
    }

    @Post("returns/:return_id/receive")
    async receiveReturnRoute(@Param("return_id") returnId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await receiveReturn({
          repo: options.repo,
          tenantId: actor.tenantId,
          returnId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {})
        });
      } catch (error) {
        mapFulfillmentError(error);
      }
    }

    @Post("returns/:return_id/complete")
    async completeReturnRoute(@Param("return_id") returnId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await completeReturn({
          repo: options.repo,
          ...(options.inventory ? { inventory: options.inventory } : {}),
          tenantId: actor.tenantId,
          returnId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(options.idempotency ? { idempotency: options.idempotency } : {})
        });
      } catch (error) {
        mapFulfillmentError(error);
      }
    }
  }

  return FulfillmentController;
}
