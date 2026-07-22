import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  Post,
  Body,
  UnprocessableEntityException
} from "@nestjs/common";
import { DomainInvariantError, parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { MissingSecurityContextError } from "@ai-sales/security";
import {
  BillingError,
  getBillingPlan,
  getBillingUsage,
  manualUpdateSubscription,
  type BillingRepository
} from "../../application/billing.js";
import type { PlanId } from "../../domain/plans.js";

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

function mapBillingError(error: unknown): never {
  if (error instanceof BillingError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
      case "ENTITLEMENT_LIMIT_EXCEEDED":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "IDEMPOTENCY_KEY_REQUIRED":
        throw new BadRequestException({ code: error.code, message: error.message });
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createBillingController(options: { readonly repo: BillingRepository }) {
  @Controller("api/v1")
  class BillingController {
    @Get("billing/plan")
    async billingPlan(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getBillingPlan({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapBillingError(error);
      }
    }

    @Get("billing/usage")
    async billingUsage(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getBillingUsage({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapBillingError(error);
      }
    }

    @Post("billing/subscription/manual-update")
    async manualUpdateRoute(
      @Body() body: { plan_id?: PlanId; reason?: string | null },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await manualUpdateSubscription({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          planId: body?.plan_id ?? "plan_free",
          ...(body?.reason !== undefined ? { reason: body.reason } : {})
        });
      } catch (error) {
        mapBillingError(error);
      }
    }
  }

  return BillingController;
}
