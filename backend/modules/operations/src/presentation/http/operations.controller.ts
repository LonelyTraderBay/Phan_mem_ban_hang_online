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
  OperationsError,
  createReprocessRequest,
  createSupportAccessForOps,
  disableTenantAI,
  getAiHealth,
  getTenantHealth,
  listSystemAlerts,
  listTenantsForOperations,
  setTenantFeatureFlag,
  type OperationsRepository
} from "../../application/operations.js";

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

function mapOpsError(error: unknown): never {
  if (error instanceof OperationsError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "RESOURCE_NOT_FOUND":
        throw new HttpException({ code: error.code, message: error.message }, 404);
      case "IDEMPOTENCY_KEY_REQUIRED":
        throw new BadRequestException({ code: error.code, message: error.message });
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createOperationsController(options: {
  readonly repo: OperationsRepository;
  readonly createSupportGrant?: (args: {
    readonly tenantId: string;
    readonly expiresAt: string;
    readonly reason: string;
  }) => Promise<{ readonly id: string; readonly status: string }>;
}) {
  @Controller("api/v1")
  class OperationsController {
    @Get("super-admin/tenants")
    async listTenants(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listTenantsForOperations({
          repo: options.repo,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapOpsError(error);
      }
    }

    @Get("super-admin/tenants/:tenant_id/health")
    async tenantHealth(@Param("tenant_id") tenantId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getTenantHealth({
          repo: options.repo,
          tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapOpsError(error);
      }
    }

    @Post("super-admin/tenants/:tenant_id/support-access")
    @HttpCode(HttpStatus.CREATED)
    async supportAccessRoute(
      @Param("tenant_id") tenantId: string,
      @Body() body: { expires_at?: string; reason?: string },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        if (!options.createSupportGrant) {
          throw new OperationsError("Support grant port not configured.", "VALIDATION_FAILED");
        }
        return await createSupportAccessForOps({
          tenantId,
          expiresAt: body?.expires_at ?? new Date(Date.now() + 3_600_000).toISOString(),
          ...(body?.reason !== undefined ? { reason: body.reason } : {}),
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          createGrant: options.createSupportGrant
        });
      } catch (error) {
        mapOpsError(error);
      }
    }

    @Post("super-admin/tenants/:tenant_id/feature-flags/:flag_key")
    async featureFlagRoute(
      @Param("tenant_id") tenantId: string,
      @Param("flag_key") flagKey: string,
      @Body() body: { enabled?: boolean; expires_at?: string | null; reason?: string | null },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await setTenantFeatureFlag({
          repo: options.repo,
          tenantId,
          flagKey,
          enabled: body?.enabled ?? false,
          ...(body?.expires_at !== undefined ? { expiresAt: body.expires_at } : {}),
          ...(body?.reason !== undefined ? { reason: body.reason } : {}),
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapOpsError(error);
      }
    }

    @Post("super-admin/tenants/:tenant_id/disable-ai")
    async disableAiRoute(@Param("tenant_id") tenantId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await disableTenantAI({
          repo: options.repo,
          tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapOpsError(error);
      }
    }

    @Get("super-admin/system-alerts")
    async systemAlerts(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listSystemAlerts({
          repo: options.repo,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapOpsError(error);
      }
    }

    @Post("super-admin/reprocess-requests")
    @HttpCode(HttpStatus.ACCEPTED)
    async reprocessRoute(
      @Body()
      body: {
        target_type?: "webhook" | "outbound" | "import" | "ai_eval";
        target_id?: string;
        reason?: string | null;
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        if (!body?.target_id?.trim()) {
          throw new OperationsError("target_id required.", "VALIDATION_FAILED");
        }
        return await createReprocessRequest({
          repo: options.repo,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          targetType: body?.target_type ?? "webhook",
          targetId: body.target_id,
          ...(body?.reason !== undefined ? { reason: body.reason } : {}),
          targetTenantId: actor.tenantId
        });
      } catch (error) {
        mapOpsError(error);
      }
    }

    @Get("super-admin/ai-health")
    async aiHealth(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getAiHealth({
          repo: options.repo,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapOpsError(error);
      }
    }
  }

  return OperationsController;
}
