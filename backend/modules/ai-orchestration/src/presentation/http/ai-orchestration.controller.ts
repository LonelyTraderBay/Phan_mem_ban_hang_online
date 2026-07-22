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
  activatePromptVersion,
  approveAISuggestion,
  approvePromptVersion,
  AiOrchestrationError,
  createAISuggestion,
  createPromptVersion,
  disableAI,
  enableAI,
  evaluateAIResponse,
  getAILog,
  getAIQualityReport,
  getEvaluationRun,
  listAIBlockedOutputs,
  listAILogs,
  listConversationAISuggestions,
  listPromptVersions,
  rollbackPromptVersion,
  runPromptEvaluation,
  sendAISuggestion,
  testAIMessage,
  type ConversationLookupPort,
  type OutboundSendPort
} from "../../application/ai-orchestration.js";
import type { KnowledgeRetrievalPort } from "../../infrastructure/clients/knowledge-retrieval.js";
import type { AiOrchestrationRepository } from "../../infrastructure/persistence/in-memory-ai-orchestration.js";
import type { ModelGatewayPort } from "../../infrastructure/gateway/model-gateway.js";

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

function mapAiError(error: unknown): never {
  if (error instanceof AiOrchestrationError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
      case "AI_TOOL_NOT_ALLOWED":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "RESOURCE_NOT_FOUND":
        throw new HttpException({ code: error.code, message: error.message }, 404);
      case "IDEMPOTENCY_KEY_REQUIRED":
        throw new BadRequestException({ code: error.code, message: error.message });
      case "AI_DISABLED":
      case "AI_OUTPUT_BLOCKED":
      case "AI_APPROVAL_REQUIRED":
      case "AI_SOURCE_REQUIRED":
      case "AI_SOURCE_STALE":
      case "AI_PROMPT_VERSION_NOT_APPROVED":
      case "AI_EVALUATION_FAILED":
        throw new HttpException({ code: error.code, message: error.message }, 409);
      case "AI_BUDGET_EXCEEDED":
        throw new HttpException({ code: error.code, message: error.message }, 429);
      case "AI_PROVIDER_UNAVAILABLE":
      case "AI_TOOL_FAILED":
        throw new HttpException({ code: error.code, message: error.message }, 503);
      case "AI_OUTPUT_INVALID":
        throw new HttpException({ code: error.code, message: error.message }, 502);
      case "VALIDATION_FAILED":
      case "CONVERSATION_STATE_INVALID":
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createAiOrchestrationController(options: {
  readonly repo: AiOrchestrationRepository;
  readonly conversations: ConversationLookupPort;
  readonly knowledge: KnowledgeRetrievalPort;
  readonly outbound: OutboundSendPort;
  readonly gateway?: ModelGatewayPort;
}) {
  @Controller("api/v1")
  class AiOrchestrationController {
    @Get("conversations/:conversation_id/ai-suggestions")
    async listConversationSuggestions(
      @Param("conversation_id") conversationId: string,
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await listConversationAISuggestions({
          repo: options.repo,
          tenantId: actor.tenantId,
          conversationId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Post("conversations/:conversation_id/ai-suggestions/:suggestion_id/approve")
    @HttpCode(HttpStatus.OK)
    async approveSuggestion(
      @Param("conversation_id") conversationId: string,
      @Param("suggestion_id") suggestionId: string,
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await approveAISuggestion({
          repo: options.repo,
          tenantId: actor.tenantId,
          conversationId,
          suggestionId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Post("conversations/:conversation_id/ai-suggestions/:suggestion_id/send")
    @HttpCode(HttpStatus.ACCEPTED)
    async sendSuggestion(
      @Param("conversation_id") conversationId: string,
      @Param("suggestion_id") suggestionId: string,
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await sendAISuggestion({
          repo: options.repo,
          outbound: options.outbound,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          conversationId,
          suggestionId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Post("ai/suggestions")
    @HttpCode(HttpStatus.ACCEPTED)
    async createSuggestion(
      @Body()
      body: {
        conversation_id?: string;
        message_id?: string | null;
        mode?: "copilot" | "semi_auto" | "autopilot";
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        if (!body?.conversation_id) {
          throw new UnprocessableEntityException({
            code: "VALIDATION_FAILED",
            message: "conversation_id is required."
          });
        }
        return await createAISuggestion({
          repo: options.repo,
          conversations: options.conversations,
          knowledge: options.knowledge,
          ...(options.gateway ? { gateway: options.gateway } : {}),
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          conversationId: body.conversation_id,
          ...(body.message_id !== undefined ? { messageId: body.message_id } : {}),
          ...(body.mode !== undefined ? { mode: body.mode } : {})
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Post("ai/evaluate-response")
    @HttpCode(HttpStatus.OK)
    async evaluateResponse(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await evaluateAIResponse({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Post("ai/test-message")
    @HttpCode(HttpStatus.OK)
    async testMessage(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await testAIMessage({
          repo: options.repo,
          ...(options.gateway ? { gateway: options.gateway } : {}),
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Get("ai/logs")
    async listLogs(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listAILogs({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Get("ai/logs/:ai_log_id")
    async getLog(@Param("ai_log_id") logId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getAILog({
          repo: options.repo,
          tenantId: actor.tenantId,
          logId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Get("ai/blocked-outputs")
    async listBlocked(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listAIBlockedOutputs({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Get("ai/prompt-versions")
    async listPrompts(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listPromptVersions({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Post("ai/prompt-versions")
    @HttpCode(HttpStatus.CREATED)
    async createPrompt(
      @Body()
      body: { name?: string; content?: string; risk_level?: "low" | "medium" | "high" },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createPromptVersion({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          name: body?.name ?? "",
          content: body?.content ?? "",
          ...(body?.risk_level !== undefined ? { riskLevel: body.risk_level } : {})
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Post("ai/prompt-versions/:prompt_version_id/run-evaluation")
    @HttpCode(HttpStatus.ACCEPTED)
    async runEval(@Param("prompt_version_id") promptVersionId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await runPromptEvaluation({
          repo: options.repo,
          tenantId: actor.tenantId,
          promptVersionId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Get("ai/evaluation-runs/:run_id")
    async getEval(@Param("run_id") runId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getEvaluationRun({
          repo: options.repo,
          tenantId: actor.tenantId,
          runId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Post("ai/prompt-versions/:prompt_version_id/approve")
    @HttpCode(HttpStatus.OK)
    async approvePrompt(@Param("prompt_version_id") promptVersionId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await approvePromptVersion({
          repo: options.repo,
          tenantId: actor.tenantId,
          promptVersionId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Post("ai/prompt-versions/:prompt_version_id/activate")
    @HttpCode(HttpStatus.OK)
    async activatePrompt(@Param("prompt_version_id") promptVersionId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await activatePromptVersion({
          repo: options.repo,
          tenantId: actor.tenantId,
          promptVersionId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Post("ai/prompt-versions/:prompt_version_id/rollback")
    @HttpCode(HttpStatus.OK)
    async rollbackPrompt(@Param("prompt_version_id") promptVersionId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await rollbackPromptVersion({
          repo: options.repo,
          tenantId: actor.tenantId,
          promptVersionId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Post("ai/disable")
    @HttpCode(HttpStatus.OK)
    async disable(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await disableAI({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Post("ai/enable")
    @HttpCode(HttpStatus.OK)
    async enable(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await enableAI({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key")
        });
      } catch (error) {
        mapAiError(error);
      }
    }

    @Get("reports/ai-quality")
    async aiQualityReport(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getAIQualityReport({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapAiError(error);
      }
    }
  }

  return AiOrchestrationController;
}
