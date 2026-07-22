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
  Query,
  UnprocessableEntityException
} from "@nestjs/common";
import type { IdempotencyStore } from "@ai-sales/idempotency";
import { DomainInvariantError, parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { MissingSecurityContextError } from "@ai-sales/security";
import {
  addConversationNoteApi,
  assignConversationApi,
  ConversationError,
  downloadAttachmentStub,
  escalateConversationApi,
  getConversationApi,
  listConversationMessagesApi,
  listConversationsApi,
  openRealtimeStreamStub,
  releaseConversationTakeoverApi,
  reopenConversationApi,
  resolveConversationApi,
  sendConversationMessageApi,
  takeOverConversationApi,
  unassignConversationApi,
  updateConversationMetadataApi,
  type ConversationRepository,
  type OutboundQueuePort
} from "../../application/conversation.js";

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

function parseExpectedVersion(
  headers: HeaderBag,
  bodyExpectedVersion: number | undefined
): number {
  const raw = optionalHeader(headers, "if-match");
  if (raw) {
    const parsed = Number.parseInt(raw.replace(/"/g, ""), 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof bodyExpectedVersion === "number") return bodyExpectedVersion;
  throw new UnprocessableEntityException({
    code: "VALIDATION_FAILED",
    message: "expected_version or If-Match header is required."
  });
}

function mapConversationError(error: unknown): never {
  if (error instanceof ConversationError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "RESOURCE_NOT_FOUND":
        throw new HttpException({ code: error.code, message: error.message }, 404);
      case "RESOURCE_VERSION_MISMATCH":
        throw new HttpException({ code: error.code, message: error.message }, 412);
      case "IDEMPOTENCY_KEY_REQUIRED":
        throw new BadRequestException({ code: error.code, message: error.message });
      case "CONVERSATION_STATE_INVALID":
      case "HUMAN_TAKEOVER_ACTIVE":
        throw new HttpException({ code: error.code, message: error.message }, 409);
      case "VALIDATION_FAILED":
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createConversationController(options: {
  readonly repo: ConversationRepository;
  readonly outbound: OutboundQueuePort;
  readonly idempotency?: IdempotencyStore;
}) {
  @Controller("api/v1")
  class ConversationController {
    @Get("conversations")
    async listConversations(
      @Headers() headers: HeaderBag,
      @Query("cursor") cursor?: string,
      @Query("limit") limit?: string
    ) {
      try {
        const actor = parseActor(headers);
        const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
        return await listConversationsApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          cursor: cursor ?? null,
          ...(parsedLimit !== undefined && !Number.isNaN(parsedLimit) ? { limit: parsedLimit } : {})
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Get("conversations/:conversation_id")
    async getConversation(
      @Param("conversation_id") conversationId: string,
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await getConversationApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          conversationId
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Patch("conversations/:conversation_id")
    async updateMetadata(
      @Param("conversation_id") conversationId: string,
      @Body() body: { expected_version?: number; metadata?: Record<string, unknown> },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await updateConversationMetadataApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          conversationId,
          expectedVersion: parseExpectedVersion(headers, body?.expected_version),
          ...(body?.metadata ? { metadata: body.metadata } : {})
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Get("conversations/:conversation_id/messages")
    async listMessages(
      @Param("conversation_id") conversationId: string,
      @Headers() headers: HeaderBag,
      @Query("cursor") cursor?: string,
      @Query("limit") limit?: string
    ) {
      try {
        const actor = parseActor(headers);
        const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
        return await listConversationMessagesApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          conversationId,
          cursor: cursor ?? null,
          ...(parsedLimit !== undefined && !Number.isNaN(parsedLimit) ? { limit: parsedLimit } : {})
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Post("conversations/:conversation_id/messages")
    @HttpCode(HttpStatus.ACCEPTED)
    async sendMessage(
      @Param("conversation_id") conversationId: string,
      @Body()
      body: {
        content?: { type?: string; text?: string | null };
        expected_conversation_version?: number;
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await sendConversationMessageApi({
          repo: options.repo,
          outbound: options.outbound,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          conversationId,
          expectedVersion: body.expected_conversation_version ?? parseExpectedVersion(headers, undefined),
          text: body.content?.text ?? ""
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Post("conversations/:conversation_id/assign")
    async assign(
      @Param("conversation_id") conversationId: string,
      @Body() body: { assignee_member_id: string; expected_version?: number },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await assignConversationApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          conversationId,
          assigneeMemberId: body.assignee_member_id,
          expectedVersion: body.expected_version ?? parseExpectedVersion(headers, undefined)
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Post("conversations/:conversation_id/unassign")
    async unassign(
      @Param("conversation_id") conversationId: string,
      @Body() body: { expected_version?: number },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await unassignConversationApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          conversationId,
          expectedVersion: body.expected_version ?? parseExpectedVersion(headers, undefined)
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Post("conversations/:conversation_id/notes")
    async addNote(
      @Param("conversation_id") conversationId: string,
      @Body() body: { body: string },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await addConversationNoteApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          conversationId,
          body: body.body
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Post("conversations/:conversation_id/resolve")
    async resolve(
      @Param("conversation_id") conversationId: string,
      @Body() body: { expected_version?: number },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await resolveConversationApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          conversationId,
          expectedVersion: body.expected_version ?? parseExpectedVersion(headers, undefined)
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Post("conversations/:conversation_id/reopen")
    async reopen(
      @Param("conversation_id") conversationId: string,
      @Body() body: { expected_version?: number },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await reopenConversationApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          conversationId,
          expectedVersion: body.expected_version ?? parseExpectedVersion(headers, undefined)
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Post("conversations/:conversation_id/escalate")
    async escalate(
      @Param("conversation_id") conversationId: string,
      @Body() body: { expected_version?: number },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await escalateConversationApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          conversationId,
          expectedVersion: body.expected_version ?? parseExpectedVersion(headers, undefined)
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Post("conversations/:conversation_id/human-takeover")
    async humanTakeover(
      @Param("conversation_id") conversationId: string,
      @Body() body: { expected_version?: number },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await takeOverConversationApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          conversationId,
          expectedVersion: body.expected_version ?? parseExpectedVersion(headers, undefined)
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Post("conversations/:conversation_id/release-takeover")
    async releaseTakeover(
      @Param("conversation_id") conversationId: string,
      @Body() body: { expected_version?: number },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await releaseConversationTakeoverApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          conversationId,
          expectedVersion: body.expected_version ?? parseExpectedVersion(headers, undefined)
        });
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Get("realtime/stream")
    async realtimeStream(
      @Headers() headers: HeaderBag,
      @Query("last_event_id") lastEventId?: string
    ) {
      try {
        const actor = parseActor(headers);
        const stream = await openRealtimeStreamStub({
          repo: options.repo,
          tenantId: actor.tenantId,
          memberId: actor.actorId,
          permissions: actor.permissions,
          lastEventId: lastEventId ?? null
        });
        if (!stream.authorized) {
          throw new ForbiddenException({ code: "INSUFFICIENT_PERMISSION", message: "Permission denied." });
        }
        return {
          data: stream.events,
          meta: { transport: "sse-stub" }
        };
      } catch (error) {
        mapConversationError(error);
      }
    }

    @Get("attachments/:attachment_id/download")
    async downloadAttachment(
      @Param("attachment_id") attachmentId: string,
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await downloadAttachmentStub({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          attachmentId
        });
      } catch (error) {
        mapConversationError(error);
      }
    }
  }

  return ConversationController;
}
