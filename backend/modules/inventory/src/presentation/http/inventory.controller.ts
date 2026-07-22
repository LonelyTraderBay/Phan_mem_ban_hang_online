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
import {
  convertInventoryReservation,
  createInventoryAdjustment,
  createInventoryReconciliation,
  createInventoryReservation,
  createWarehouse,
  extendInventoryReservation,
  formatEtag,
  getInventoryAdjustment,
  getInventoryReconciliation,
  getInventoryReservation,
  InventoryError,
  listBalances,
  listMovements,
  listWarehouses,
  parseIfMatchVersion,
  releaseInventoryReservation,
  updateWarehouse,
  type InventoryRepository,
  type ReservationOwnerType
} from "../../application/inventory.js";

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

function mapInventoryError(error: unknown): never {
  if (error instanceof InventoryError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "RESOURCE_NOT_FOUND":
      case "INVENTORY_BALANCE_NOT_FOUND":
        throw new HttpException({ code: error.code, message: error.message }, 404);
      case "RESOURCE_VERSION_MISMATCH":
        throw new HttpException({ code: error.code, message: error.message }, 412);
      case "IDEMPOTENCY_KEY_REQUIRED":
        throw new BadRequestException({ code: error.code, message: error.message });
      case "INVENTORY_INSUFFICIENT":
      case "INVENTORY_RESERVATION_EXPIRED":
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

export function createInventoryController(options: { readonly repo: InventoryRepository }) {
  @Controller("api/v1")
  class InventoryController {
    @Get("warehouses")
    async listWarehousesRoute(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listWarehouses({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Post("warehouses")
    @HttpCode(HttpStatus.CREATED)
    async createWarehouseRoute(
      @Body() body: { name?: string; code?: string; address?: string | null },
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const actor = parseActor(headers);
        const result = await createWarehouse({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          name: body?.name ?? "",
          code: body?.code ?? "",
          ...(body?.address !== undefined ? { address: body.address } : {})
        });
        reply.header("ETag", formatEtag(result.version));
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Patch("warehouses/:warehouse_id")
    async updateWarehouseRoute(
      @Param("warehouse_id") warehouseId: string,
      @Body() body: { expected_version?: number; name?: string | null; address?: string | null },
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const actor = parseActor(headers);
        const result = await updateWarehouse({
          repo: options.repo,
          tenantId: actor.tenantId,
          warehouseId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          expectedVersion: resolveExpectedVersion(headers, body?.expected_version),
          ...(body?.name !== undefined ? { name: body.name } : {}),
          ...(body?.address !== undefined ? { address: body.address } : {})
        });
        reply.header("ETag", formatEtag(result.version));
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Get("inventory/balances")
    async listBalancesRoute(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listBalances({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Get("inventory/movements")
    async listMovementsRoute(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listMovements({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Post("inventory/adjustments")
    @HttpCode(HttpStatus.CREATED)
    async createAdjustmentRoute(
      @Body()
      body: {
        warehouse_id?: string;
        variant_id?: string;
        quantity_delta?: string;
        reason?: string;
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createInventoryAdjustment({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          warehouseId: body?.warehouse_id ?? "",
          variantId: body?.variant_id ?? "",
          quantityDelta: body?.quantity_delta ?? "",
          reason: body?.reason ?? ""
        });
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Get("inventory/adjustments/:adjustment_id")
    async getAdjustmentRoute(
      @Param("adjustment_id") adjustmentId: string,
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await getInventoryAdjustment({
          repo: options.repo,
          tenantId: actor.tenantId,
          adjustmentId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Post("inventory/reservations")
    @HttpCode(HttpStatus.CREATED)
    async createReservationRoute(
      @Body()
      body: {
        owner?: { type?: ReservationOwnerType; id?: string };
        expires_at?: string;
        allocation_strategy?: "preferred_only" | "preferred_then_available" | "any_available";
        items?: { variant_id: string; quantity: string; preferred_warehouse_id?: string | null }[];
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createInventoryReservation({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ownerType: body?.owner?.type ?? "manual",
          ownerId: body?.owner?.id ?? "",
          expiresAt: body?.expires_at ?? "",
          ...(body?.allocation_strategy !== undefined
            ? { allocationStrategy: body.allocation_strategy }
            : {}),
          items: body?.items ?? []
        });
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Get("inventory/reservations/:reservation_id")
    async getReservationRoute(
      @Param("reservation_id") reservationId: string,
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await getInventoryReservation({
          repo: options.repo,
          tenantId: actor.tenantId,
          reservationId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Post("inventory/reservations/:reservation_id/release")
    async releaseReservationRoute(
      @Param("reservation_id") reservationId: string,
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await releaseInventoryReservation({
          repo: options.repo,
          tenantId: actor.tenantId,
          reservationId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Post("inventory/reservations/:reservation_id/extend")
    async extendReservationRoute(
      @Param("reservation_id") reservationId: string,
      @Body() body: { expires_at?: string; expected_version?: number },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await extendInventoryReservation({
          repo: options.repo,
          tenantId: actor.tenantId,
          reservationId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          expiresAt: body?.expires_at ?? "",
          expectedVersion: body?.expected_version ?? resolveExpectedVersion(headers, undefined)
        });
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Post("inventory/reservations/:reservation_id/convert")
    async convertReservationRoute(
      @Param("reservation_id") reservationId: string,
      @Body() body: { owner_id?: string },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await convertInventoryReservation({
          repo: options.repo,
          tenantId: actor.tenantId,
          reservationId,
          ownerId: body?.owner_id ?? "",
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Post("inventory/reconciliation-jobs")
    @HttpCode(HttpStatus.ACCEPTED)
    async createReconciliationRoute(
      @Body() body: { warehouse_id?: string },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createInventoryReconciliation({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          warehouseId: body?.warehouse_id ?? ""
        });
      } catch (error) {
        mapInventoryError(error);
      }
    }

    @Get("inventory/reconciliation-jobs/:job_id")
    async getReconciliationRoute(@Param("job_id") jobId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getInventoryReconciliation({
          repo: options.repo,
          tenantId: actor.tenantId,
          jobId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapInventoryError(error);
      }
    }
  }

  return InventoryController;
}
