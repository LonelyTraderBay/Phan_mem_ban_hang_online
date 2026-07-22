import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  Body,
  UnprocessableEntityException,
  HttpCode,
  HttpStatus
} from "@nestjs/common";
import type { IdempotencyStore } from "@ai-sales/idempotency";
import { DomainInvariantError, parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { MissingSecurityContextError } from "@ai-sales/security";
import {
  provisionTenant,
  TenantProvisionError,
  type ProvisionTenantInput,
  type TenantProvisionRepository
} from "../../application/provision-tenant.js";

type HeaderBag = Record<string, string | string[] | undefined>;

function headerValue(headers: HeaderBag, name: string): string {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new MissingSecurityContextError(name);
  }
  return raw.trim();
}

export interface ProvisionTenantControllerOptions {
  readonly repo: TenantProvisionRepository;
  readonly idempotency: IdempotencyStore;
}

class ProvisionTenantDto {
  code!: string;
  name!: string;
  owner_email!: string;
  timezone?: string | null;
  currency?: string | null;
  locale?: string | null;
  plan_id?: string | null;
}

function toProvisionInput(body: ProvisionTenantDto): ProvisionTenantInput {
  return {
    code: body.code,
    name: body.name,
    ownerEmail: body.owner_email,
    timezone: body.timezone ?? null,
    currency: body.currency ?? null,
    locale: body.locale ?? null,
    planId: body.plan_id ?? null
  };
}

export function createProvisionTenantController(options: ProvisionTenantControllerOptions) {
  @Controller("api/v1/tenants")
  class ProvisionTenantController {
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async provision(
      @Body() body: ProvisionTenantDto,
      @Headers() headers: HeaderBag
    ) {
      let actorId: UuidV7;
      let correlationId: string;
      try {
        actorId = parseUuidV7(headerValue(headers, "x-actor-id"));
        correlationId = headerValue(headers, "x-correlation-id");
      } catch (error) {
        if (error instanceof MissingSecurityContextError || error instanceof DomainInvariantError) {
          throw new ForbiddenException("Authenticated actor context required.");
        }
        throw error;
      }

      const idempotencyKey = (() => {
        try {
          return headerValue(headers, "idempotency-key");
        } catch {
          throw new BadRequestException("Idempotency-Key header is required.");
        }
      })();

      if (!body?.code || !body?.name || !body?.owner_email) {
        throw new BadRequestException("code, name, and owner_email are required.");
      }

      try {
        const result = await provisionTenant({
          actor: {
            actorType: "user",
            actorId,
            permissions: [],
            tenantTimezone: "UTC",
            correlationId
          },
          input: toProvisionInput(body),
          idempotencyKey,
          idempotency: options.idempotency,
          repo: options.repo
        });
        return result.body;
      } catch (error) {
        if (error instanceof TenantProvisionError) {
          if (error.code === "CONFLICT") {
            throw new ConflictException(error.message);
          }
          if (error.code === "INACTIVE_PLAN" || error.code === "VALIDATION_FAILED") {
            throw new UnprocessableEntityException(error.message);
          }
        }
        throw error;
      }
    }
  }

  return ProvisionTenantController;
}
