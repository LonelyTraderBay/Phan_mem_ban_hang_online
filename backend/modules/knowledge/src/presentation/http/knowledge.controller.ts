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
  approveKnowledgeVersion,
  archiveKnowledgeVersion,
  createKnowledgeSource,
  createKnowledgeVersion,
  getKnowledgeIngestion,
  getKnowledgeSource,
  KnowledgeError,
  listKnowledgeSources,
  parseIfMatchVersion,
  publishKnowledgeVersion,
  submitKnowledgeReview,
  testKnowledgeSearch,
  updateKnowledgeVersion,
  type KnowledgeRepository,
  type KnowledgeSourceType
} from "../../application/knowledge.js";

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

function mapKnowledgeError(error: unknown): never {
  if (error instanceof KnowledgeError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "RESOURCE_NOT_FOUND":
        throw new HttpException({ code: error.code, message: error.message }, 404);
      case "RESOURCE_VERSION_MISMATCH":
        throw new HttpException({ code: error.code, message: error.message }, 412);
      case "IDEMPOTENCY_KEY_REQUIRED":
        throw new BadRequestException({ code: error.code, message: error.message });
      case "VALIDATION_FAILED":
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createKnowledgeController(options: { readonly repo: KnowledgeRepository }) {
  @Controller("api/v1")
  class KnowledgeController {
    @Get("knowledge/sources")
    async listSources(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listKnowledgeSources({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapKnowledgeError(error);
      }
    }

    @Post("knowledge/sources")
    @HttpCode(HttpStatus.CREATED)
    async createSource(
      @Body() body: { name?: string; type?: KnowledgeSourceType; uri?: string | null },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createKnowledgeSource({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          name: body?.name ?? "",
          type: body?.type ?? "manual",
          uri: body?.uri ?? null
        });
      } catch (error) {
        mapKnowledgeError(error);
      }
    }

    @Get("knowledge/sources/:source_id")
    async getSource(@Param("source_id") sourceId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getKnowledgeSource({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          sourceId
        });
      } catch (error) {
        mapKnowledgeError(error);
      }
    }

    @Post("knowledge/sources/:source_id/versions")
    @HttpCode(HttpStatus.CREATED)
    async createVersion(
      @Param("source_id") sourceId: string,
      @Body() body: { title?: string; body_markdown?: string | null },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createKnowledgeVersion({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          sourceId,
          title: body?.title ?? "",
          bodyMarkdown: body?.body_markdown ?? null
        });
      } catch (error) {
        mapKnowledgeError(error);
      }
    }

    @Patch("knowledge/versions/:version_id")
    async updateVersion(
      @Param("version_id") versionId: string,
      @Body() body: { expected_version?: number; title?: string | null; body_markdown?: string | null },
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const actor = parseActor(headers);
        const result = await updateKnowledgeVersion({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          versionId,
          expectedVersion: resolveExpectedVersion(headers, body?.expected_version),
          title: body?.title ?? null,
          bodyMarkdown: body?.body_markdown ?? null
        });
        reply.header("ETag", `"v${result.data.version}"`);
        return result;
      } catch (error) {
        mapKnowledgeError(error);
      }
    }

    @Post("knowledge/versions/:version_id/submit-review")
    async submitReview(@Param("version_id") versionId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await submitKnowledgeReview({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          versionId
        });
      } catch (error) {
        mapKnowledgeError(error);
      }
    }

    @Post("knowledge/versions/:version_id/approve")
    async approveVersion(@Param("version_id") versionId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await approveKnowledgeVersion({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          versionId
        });
      } catch (error) {
        mapKnowledgeError(error);
      }
    }

    @Post("knowledge/versions/:version_id/publish")
    @HttpCode(HttpStatus.ACCEPTED)
    async publishVersion(@Param("version_id") versionId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await publishKnowledgeVersion({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          versionId
        });
      } catch (error) {
        mapKnowledgeError(error);
      }
    }

    @Post("knowledge/versions/:version_id/archive")
    async archiveVersion(@Param("version_id") versionId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await archiveKnowledgeVersion({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          versionId
        });
      } catch (error) {
        mapKnowledgeError(error);
      }
    }

    @Get("knowledge/versions/:version_id/ingestion")
    async getIngestion(@Param("version_id") versionId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getKnowledgeIngestion({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          versionId
        });
      } catch (error) {
        mapKnowledgeError(error);
      }
    }

    @Post("knowledge/search-test")
    async searchTest(
      @Body() body: { query?: string; top_k?: number },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await testKnowledgeSearch({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          query: body?.query ?? "",
          ...(body?.top_k !== undefined ? { topK: body.top_k } : {})
        });
      } catch (error) {
        mapKnowledgeError(error);
      }
    }
  }

  return KnowledgeController;
}
