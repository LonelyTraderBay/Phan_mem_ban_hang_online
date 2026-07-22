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
  addCustomerIdentity,
  createCustomer,
  CustomerError,
  formatEtag,
  getCustomer,
  listCustomers,
  mergeCustomers,
  parseIfMatchVersion,
  previewCustomerMerge,
  updateCustomer,
  type CustomerRepository
} from "../../application/customers.js";

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

function mapCustomerError(error: unknown): never {
  if (error instanceof CustomerError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "RESOURCE_NOT_FOUND":
        throw new HttpException({ code: error.code, message: error.message }, 404);
      case "RESOURCE_VERSION_MISMATCH":
        throw new HttpException({ code: error.code, message: error.message }, 412);
      case "IDEMPOTENCY_KEY_REQUIRED":
        throw new BadRequestException({ code: error.code, message: error.message });
      case "CUSTOMER_IDENTITY_CONFLICT":
      case "CUSTOMER_MERGE_CONFLICT":
        throw new HttpException({ code: error.code, message: error.message }, 409);
      case "VALIDATION_FAILED":
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createCustomersController(options: { readonly repo: CustomerRepository }) {
  @Controller("api/v1/customers")
  class CustomersController {
    @Get()
    async list(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listCustomers({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapCustomerError(error);
      }
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(
      @Body()
      body: {
        display_name?: string | null;
        primary_email?: string | null;
        primary_phone?: string | null;
        tags?: string[];
      },
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const actor = parseActor(headers);
        const result = await createCustomer({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          ...(body?.display_name !== undefined ? { displayName: body.display_name } : {}),
          ...(body?.primary_email !== undefined ? { primaryEmail: body.primary_email } : {}),
          ...(body?.primary_phone !== undefined ? { primaryPhone: body.primary_phone } : {}),
          ...(body?.tags !== undefined ? { tags: body.tags } : {})
        });
        reply.header("ETag", formatEtag(result.version));
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapCustomerError(error);
      }
    }

    @Post("merge-preview")
    async mergePreview(
      @Body() body: { survivor_id?: string; merge_ids?: string[] },
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const actor = parseActor(headers);
        const result = await previewCustomerMerge({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          survivorId: body?.survivor_id ?? "",
          mergeIds: body?.merge_ids ?? []
        });
        reply.header("ETag", formatEtag(result.version));
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapCustomerError(error);
      }
    }

    @Post("merge")
    async merge(
      @Body()
      body: {
        survivor_id?: string;
        merge_ids?: string[];
        confirmation_token?: string;
      },
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const actor = parseActor(headers);
        const correlationId = optionalHeader(headers, "x-correlation-id");
        const result = await mergeCustomers({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          survivorId: body?.survivor_id ?? "",
          mergeIds: body?.merge_ids ?? [],
          confirmationToken: body?.confirmation_token ?? "",
          ...(correlationId !== undefined ? { correlationId } : {})
        });
        reply.header("ETag", formatEtag(result.version));
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapCustomerError(error);
      }
    }

    @Get(":customer_id")
    async get(
      @Param("customer_id") customerId: string,
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const actor = parseActor(headers);
        const result = await getCustomer({
          repo: options.repo,
          tenantId: actor.tenantId,
          customerId,
          actorPermissions: actor.permissions
        });
        reply.header("ETag", formatEtag(result.version));
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapCustomerError(error);
      }
    }

    @Patch(":customer_id")
    async update(
      @Param("customer_id") customerId: string,
      @Body()
      body: {
        expected_version?: number;
        display_name?: string | null;
        primary_email?: string | null;
        primary_phone?: string | null;
      },
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const actor = parseActor(headers);
        const expectedVersion = resolveExpectedVersion(headers, body?.expected_version);
        const result = await updateCustomer({
          repo: options.repo,
          tenantId: actor.tenantId,
          customerId,
          actorPermissions: actor.permissions,
          expectedVersion,
          ...(body?.display_name !== undefined ? { displayName: body.display_name } : {}),
          ...(body?.primary_email !== undefined ? { primaryEmail: body.primary_email } : {}),
          ...(body?.primary_phone !== undefined ? { primaryPhone: body.primary_phone } : {})
        });
        reply.header("ETag", formatEtag(result.version));
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapCustomerError(error);
      }
    }

    @Post(":customer_id/identities")
    async addIdentity(
      @Param("customer_id") customerId: string,
      @Body() body: { type?: string; value?: string },
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const actor = parseActor(headers);
        const result = await addCustomerIdentity({
          repo: options.repo,
          tenantId: actor.tenantId,
          customerId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          type: body?.type ?? "",
          value: body?.value ?? ""
        });
        reply.header("ETag", formatEtag(result.version));
        return { data: result.data, meta: result.meta };
      } catch (error) {
        mapCustomerError(error);
      }
    }
  }

  return CustomersController;
}
