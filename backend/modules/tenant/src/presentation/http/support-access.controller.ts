import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post
} from "@nestjs/common";
import { DomainInvariantError, parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { MissingSecurityContextError } from "@ai-sales/security";
import {
  createSupportAccess,
  SupportGrantError,
  type SupportGrantStore,
  type SupportScope
} from "../../application/support-grant.js";

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
  permissions: string[];
} {
  try {
    const actorId = parseUuidV7(headerValue(headers, "x-actor-id"));
    const permissions = (optionalHeader(headers, "x-permissions") ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    return { actorId, permissions };
  } catch (error) {
    if (error instanceof MissingSecurityContextError || error instanceof DomainInvariantError) {
      throw new ForbiddenException({ code: "AUTH_UNAUTHORIZED", message: "Actor context required." });
    }
    throw error;
  }
}

function mapError(error: unknown): never {
  if (error instanceof SupportGrantError) {
    if (error.code === "INSUFFICIENT_PERMISSION" || error.code === "SUPPORT_SCOPE_DENIED") {
      throw new ForbiddenException({ code: error.code, message: error.message });
    }
    if (error.code === "RESOURCE_NOT_FOUND") {
      throw new HttpException({ code: error.code, message: error.message }, 404);
    }
    if (error.code === "SUPPORT_GRANT_EXPIRED" || error.code === "SUPPORT_GRANT_REVOKED") {
      throw new HttpException({ code: error.code, message: error.message }, 409);
    }
    throw new BadRequestException({ code: error.code, message: error.message });
  }
  throw error;
}

export function createSupportAccessController(options: { readonly store: SupportGrantStore }) {
  @Controller("api/v1/super-admin/tenants")
  class SupportAccessController {
    @Post(":tenant_id/support-access")
    @HttpCode(HttpStatus.CREATED)
    async create(
      @Param("tenant_id") tenantId: string,
      @Body()
      body: {
        tenant_id?: string;
        expires_at?: string;
        reason?: string;
        grantee_user_id?: string;
        scope?: SupportScope;
        ticket_ref?: string | null;
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        if (!optionalHeader(headers, "idempotency-key")) {
          throw new BadRequestException("Idempotency-Key header is required.");
        }
        const grantee =
          body?.grantee_user_id?.trim() ||
          optionalHeader(headers, "x-grantee-user-id") ||
          actor.actorId;
        return await createSupportAccess({
          store: options.store,
          actorPermissions: actor.permissions,
          actorUserId: actor.actorId,
          tenantId: tenantId || body?.tenant_id || "",
          granteeUserId: grantee,
          expiresAt: body?.expires_at ?? "",
          ...(body?.reason !== undefined ? { reason: body.reason } : {}),
          ticketRef: body?.ticket_ref ?? null,
          scope: body?.scope ?? "read"
        });
      } catch (error) {
        mapError(error);
      }
    }
  }

  return SupportAccessController;
}
