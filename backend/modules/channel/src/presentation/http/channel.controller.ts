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
  Query,
  Req,
  UnprocessableEntityException
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { DomainInvariantError, parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import type { IdempotencyStore } from "@ai-sales/idempotency";
import { MissingSecurityContextError } from "@ai-sales/security";
import type { ChannelProviderAdapter } from "../../domain/adapter.js";
import {
  ChannelError,
  connectChannel,
  disconnectChannel,
  getChannelAccount,
  getOutboundMessageApi,
  getWebhookEventApi,
  handleOAuthCallback,
  listChannelAccounts,
  listWebhookEventsApi,
  receiveWebhook,
  refreshChannelHealth,
  reprocessWebhookEvent,
  retryOutboundMessageApi,
  type ChannelRepository
} from "../../application/channel.js";

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

function mapChannelError(error: unknown): never {
  if (error instanceof ChannelError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "RESOURCE_NOT_FOUND":
        throw new HttpException({ code: error.code, message: error.message }, 404);
      case "RESOURCE_VERSION_MISMATCH":
        throw new HttpException({ code: error.code, message: error.message }, 412);
      case "IDEMPOTENCY_KEY_REQUIRED":
        throw new BadRequestException({ code: error.code, message: error.message });
      case "WEBHOOK_SIGNATURE_INVALID":
        throw new HttpException({ code: error.code, message: error.message }, 401);
      case "CHANNEL_NOT_CONNECTED":
      case "CHANNEL_TOKEN_EXPIRED":
      case "CHANNEL_PERMISSION_MISSING":
      case "MESSAGE_SEND_BLOCKED":
        throw new HttpException({ code: error.code, message: error.message }, 409);
      case "WEBHOOK_DUPLICATE":
        throw new HttpException({ code: error.code, message: error.message }, 200);
      case "VALIDATION_FAILED":
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createChannelController(options: {
  readonly repo: ChannelRepository;
  readonly adapter: ChannelProviderAdapter;
  readonly webhookSecretRef?: string;
  readonly outboundSecretRef?: string;
  readonly idempotency?: IdempotencyStore;
}) {
  const secretRef = options.webhookSecretRef ?? "stub-webhook-secret";
  const outboundSecretRef = options.outboundSecretRef ?? "stub-outbound-secret";

  @Controller("api/v1")
  class ChannelController {
    @Get("channels/accounts")
    async listAccounts(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listChannelAccounts({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapChannelError(error);
      }
    }

    @Post("channels/:provider/connect")
    @HttpCode(HttpStatus.OK)
    async connect(
      @Param("provider") provider: string,
      @Body() body: { display_name?: string | null; oauth_return_path?: string | null },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await connectChannel({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          provider,
          displayName: body?.display_name ?? null,
          oauthReturnPath: body?.oauth_return_path ?? null
        });
      } catch (error) {
        mapChannelError(error);
      }
    }

    @Get("channels/:provider/oauth/callback")
    async oauthCallback(
      @Param("provider") provider: string,
      @Query("state") state: string,
      @Query("code") code: string,
      @Query("code_verifier") codeVerifier: string,
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await handleOAuthCallback({
          repo: options.repo,
          tenantId: actor.tenantId,
          provider,
          state,
          code,
          codeVerifier
        });
      } catch (error) {
        mapChannelError(error);
      }
    }

    @Get("channels/accounts/:account_id")
    async getAccount(@Param("account_id") accountId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getChannelAccount({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          accountId
        });
      } catch (error) {
        mapChannelError(error);
      }
    }

    @Post("channels/accounts/:account_id/refresh-health")
    @HttpCode(HttpStatus.ACCEPTED)
    async refreshHealth(@Param("account_id") accountId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await refreshChannelHealth({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          accountId
        });
      } catch (error) {
        mapChannelError(error);
      }
    }

    @Post("channels/accounts/:account_id/disconnect")
    async disconnect(@Param("account_id") accountId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await disconnectChannel({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          accountId
        });
      } catch (error) {
        mapChannelError(error);
      }
    }

    @Post("webhooks/:provider")
    @HttpCode(HttpStatus.OK)
    async receiveProviderWebhook(
      @Param("provider") provider: string,
      @Req() req: FastifyRequest,
      @Headers() headers: HeaderBag
    ) {
      try {
        const rawBody = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}));
        const tenantId = optionalHeader(headers, "x-tenant-id") ?? null;
        const channelAccountId = optionalHeader(headers, "x-channel-account-id") ?? null;
        return await receiveWebhook({
          repo: options.repo,
          adapter: options.adapter,
          provider,
          rawBody,
          signatureHeader: optionalHeader(headers, "x-hub-signature-256") ?? null,
          secretRef,
          tenantId,
          channelAccountId
        });
      } catch (error) {
        mapChannelError(error);
      }
    }

    @Get("webhook-events")
    async listWebhookEvents(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listWebhookEventsApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapChannelError(error);
      }
    }

    @Get("webhook-events/:event_id")
    async getWebhookEvent(@Param("event_id") eventId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getWebhookEventApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          eventId
        });
      } catch (error) {
        mapChannelError(error);
      }
    }

    @Post("webhook-events/:event_id/reprocess")
    @HttpCode(HttpStatus.ACCEPTED)
    async reprocessWebhook(@Param("event_id") eventId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await reprocessWebhookEvent({
          repo: options.repo,
          adapter: options.adapter,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          eventId
        });
      } catch (error) {
        mapChannelError(error);
      }
    }

    @Get("outbound-messages/:message_id")
    async getOutboundMessage(@Param("message_id") messageId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getOutboundMessageApi({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          messageId
        });
      } catch (error) {
        mapChannelError(error);
      }
    }

    @Post("outbound-messages/:message_id/retry")
    @HttpCode(HttpStatus.ACCEPTED)
    async retryOutbound(@Param("message_id") messageId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await retryOutboundMessageApi({
          repo: options.repo,
          adapter: options.adapter,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          ...(options.idempotency ? { idempotency: options.idempotency } : {}),
          messageId,
          secretRef: outboundSecretRef,
          externalThreadId: "thread-stub"
        });
      } catch (error) {
        mapChannelError(error);
      }
    }
  }

  return ChannelController;
}
