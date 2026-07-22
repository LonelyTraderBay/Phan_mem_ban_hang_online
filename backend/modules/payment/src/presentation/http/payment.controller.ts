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
  Post,
  Body,
  UnprocessableEntityException
} from "@nestjs/common";
import { DomainInvariantError, parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { MissingSecurityContextError } from "@ai-sales/security";
import {
  confirmPayment,
  createRefund,
  listOrderPayments,
  PaymentError,
  recordPayment,
  type OrderLookupPort,
  type PaymentRepository
} from "../../application/payment.js";

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

function mapPaymentError(error: unknown): never {
  if (error instanceof PaymentError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "RESOURCE_NOT_FOUND":
        throw new HttpException({ code: error.code, message: error.message }, 404);
      case "RESOURCE_VERSION_MISMATCH":
        throw new HttpException({ code: error.code, message: error.message }, 412);
      case "IDEMPOTENCY_KEY_REQUIRED":
        throw new BadRequestException({ code: error.code, message: error.message });
      case "PAYMENT_AMOUNT_MISMATCH":
      case "PAYMENT_STATE_INVALID":
        throw new HttpException({ code: error.code, message: error.message }, 409);
      case "VALIDATION_FAILED":
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createPaymentController(options: {
  readonly repo: PaymentRepository;
  readonly orders: OrderLookupPort;
}) {
  @Controller("api/v1")
  class PaymentController {
    @Post("orders/:order_id/payments")
    @HttpCode(HttpStatus.CREATED)
    async recordPaymentRoute(
      @Param("order_id") orderId: string,
      @Body()
      body: {
        amount_minor?: number;
        currency?: string;
        method?: string;
        provider_ref?: string | null;
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await recordPayment({
          repo: options.repo,
          orders: options.orders,
          tenantId: actor.tenantId,
          orderId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          amountMinor: body?.amount_minor ?? 0,
          currency: body?.currency ?? "VND",
          method: body?.method ?? "transfer",
          ...(body?.provider_ref !== undefined ? { providerRef: body.provider_ref } : {})
        });
      } catch (error) {
        mapPaymentError(error);
      }
    }

    @Get("orders/:order_id/payments")
    async listPaymentsRoute(@Param("order_id") orderId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listOrderPayments({
          repo: options.repo,
          tenantId: actor.tenantId,
          orderId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapPaymentError(error);
      }
    }

    @Post("payments/:payment_id/confirm")
    async confirmPaymentRoute(
      @Param("payment_id") paymentId: string,
      @Body() body: { expected_version?: number; provider_ref?: string | null },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await confirmPayment({
          repo: options.repo,
          tenantId: actor.tenantId,
          paymentId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          expectedVersion: body?.expected_version ?? 1,
          ...(body?.provider_ref !== undefined ? { providerRef: body.provider_ref } : {})
        });
      } catch (error) {
        mapPaymentError(error);
      }
    }

    @Post("payments/:payment_id/refunds")
    @HttpCode(HttpStatus.CREATED)
    async createRefundRoute(
      @Param("payment_id") paymentId: string,
      @Body() body: { amount_minor?: number; reason?: string },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createRefund({
          repo: options.repo,
          tenantId: actor.tenantId,
          paymentId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          amountMinor: body?.amount_minor ?? 0,
          reason: body?.reason ?? ""
        });
      } catch (error) {
        mapPaymentError(error);
      }
    }
  }

  return PaymentController;
}
