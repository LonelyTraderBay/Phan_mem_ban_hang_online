import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  Patch,
  Body,
  Res,
  UnprocessableEntityException
} from "@nestjs/common";
import { DomainInvariantError, parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  getCurrentTenant,
  TenantSettingsError,
  updateCurrentTenant,
  type TenantSettingsRepository
} from "../../application/current-tenant.js";

type HeaderBag = Record<string, string | string[] | undefined>;
type ReplyWithHeaders = { header(name: string, value: string): unknown };

export type CurrentTenantSessionActor = {
  readonly actorId: string;
  readonly tenantId: string;
  readonly permissions: readonly string[];
};

export interface CurrentTenantControllerOptions {
  readonly repo: TenantSettingsRepository;
  readonly resolveSessionActor?: (
    cookieHeader: string | undefined
  ) => Promise<CurrentTenantSessionActor | null>;
}

function optionalHeader(headers: HeaderBag, name: string): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function parsePermissions(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

async function parseActor(
  headers: HeaderBag,
  options: CurrentTenantControllerOptions
): Promise<{
  tenantId: string;
  permissions: readonly string[];
}> {
  const headerActorId = optionalHeader(headers, "x-actor-id");
  const headerTenantId = optionalHeader(headers, "x-tenant-id");
  if (headerActorId && headerTenantId) {
    try {
      parseUuidV7(headerActorId);
      return {
        tenantId: headerTenantId,
        permissions: parsePermissions(optionalHeader(headers, "x-permissions"))
      };
    } catch (error) {
      if (error instanceof DomainInvariantError) {
        throw new ForbiddenException({ code: "AUTH_UNAUTHORIZED", message: "Actor context required." });
      }
      throw error;
    }
  }

  const sessionActor = await options.resolveSessionActor?.(optionalHeader(headers, "cookie"));
  if (sessionActor) {
    parseUuidV7(sessionActor.actorId);
    return {
      tenantId: sessionActor.tenantId,
      permissions: sessionActor.permissions
    };
  }

  throw new ForbiddenException({ code: "AUTH_UNAUTHORIZED", message: "Actor context required." });
}

function parseIfMatchVersion(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^"?(?:v)?(\d+)"?$/.exec(value.trim());
  return match?.[1] ? Number(match[1]) : null;
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

function mapTenantSettingsError(error: unknown): never {
  if (error instanceof TenantSettingsError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "RESOURCE_NOT_FOUND":
        throw new HttpException({ code: error.code, message: error.message }, 404);
      case "RESOURCE_VERSION_MISMATCH":
        throw new HttpException({ code: error.code, message: error.message }, 412);
      case "VALIDATION_FAILED":
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createCurrentTenantController(options: CurrentTenantControllerOptions) {
  @Controller("api/v1/tenants")
  class CurrentTenantController {
    @Get("current")
    async get(@Headers() headers: HeaderBag, @Res({ passthrough: true }) reply: ReplyWithHeaders) {
      try {
        const actor = await parseActor(headers, options);
        const result = await getCurrentTenant({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
        reply.header("ETag", `"v${result.data.version}"`);
        return result;
      } catch (error) {
        mapTenantSettingsError(error);
      }
    }

    @Patch("current")
    async update(
      @Body() body: { expected_version?: number; name?: string | null },
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: ReplyWithHeaders
    ) {
      try {
        const actor = await parseActor(headers, options);
        const result = await updateCurrentTenant({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          expectedVersion: resolveExpectedVersion(headers, body?.expected_version),
          ...(body?.name !== undefined ? { name: body.name } : {})
        });
        reply.header("ETag", `"v${result.data.version}"`);
        return result;
      } catch (error) {
        mapTenantSettingsError(error);
      }
    }
  }

  return CurrentTenantController;
}
