import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post
} from "@nestjs/common";
import { DomainInvariantError, parseUuidV7 } from "@ai-sales/domain-kernel";
import { MissingSecurityContextError } from "@ai-sales/security";
import {
  AuditQueryError,
  createAuditExport,
  listAuditLogs,
  type AuditLogStore
} from "../../application/list-audit.js";

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

function parseActor(headers: HeaderBag) {
  try {
    parseUuidV7(headerValue(headers, "x-actor-id"));
    const tenantId = headerValue(headers, "x-tenant-id");
    const permissions = (optionalHeader(headers, "x-permissions") ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    return { tenantId, permissions };
  } catch (error) {
    if (error instanceof MissingSecurityContextError || error instanceof DomainInvariantError) {
      throw new ForbiddenException({ code: "AUTH_UNAUTHORIZED", message: "Actor context required." });
    }
    throw error;
  }
}

function mapError(error: unknown): never {
  if (error instanceof AuditQueryError) {
    if (error.code === "INSUFFICIENT_PERMISSION") {
      throw new ForbiddenException({ code: error.code, message: error.message });
    }
    throw new BadRequestException({ code: error.code, message: error.message });
  }
  throw error;
}

export function createAuditLogsController(options: { readonly store: AuditLogStore }) {
  @Controller("api/v1/audit-logs")
  class AuditLogsController {
    @Get()
    async list(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listAuditLogs({
          store: options.store,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapError(error);
      }
    }
  }
  return AuditLogsController;
}

export function createAuditExportsController(options: { readonly store: AuditLogStore }) {
  @Controller("api/v1/audit-exports")
  class AuditExportsController {
    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    async create(
      @Body() body: { from?: string; to?: string; actor_user_id?: string | null },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        const idempotencyKey = optionalHeader(headers, "idempotency-key");
        if (!idempotencyKey) {
          throw new BadRequestException("Idempotency-Key header is required.");
        }
        const result = await createAuditExport({
          store: options.store,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          from: body?.from ?? "",
          to: body?.to ?? "",
          actorUserId: body?.actor_user_id ?? null,
          idempotencyKey
        });
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapError(error);
      }
    }
  }
  return AuditExportsController;
}
