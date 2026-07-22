import {
  Controller,
  Post,
  Body,
  Headers,
  ForbiddenException,
  ServiceUnavailableException,
  BadRequestException
} from "@nestjs/common";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { MissingSecurityContextError, requirePermission } from "@ai-sales/security";
import type { WalkingSkeletonTracer } from "../../application/ports/audit-writer.port.js";
import { securityContextFromHeaders } from "./walking-skeleton-security-context.js";

class TraceWalkingSkeletonDto {
  message!: string;
}

function nextWalkingSkeletonIds(): { auditId: UuidV7; outboxId: UuidV7; aggregateId: UuidV7 } {
  return {
    auditId: generateUuidV7(),
    outboxId: generateUuidV7(),
    aggregateId: generateUuidV7()
  };
}

export interface WalkingSkeletonControllerOptions {
  readonly enabled: boolean;
  readonly tracer: WalkingSkeletonTracer;
}

export function createWalkingSkeletonController(options: WalkingSkeletonControllerOptions) {
  @Controller("api/v1/_internal/walking-skeleton")
  class WalkingSkeletonController {
    @Post("trace")
    async trace(
      @Body() body: TraceWalkingSkeletonDto,
      @Headers() headers: Record<string, string | string[] | undefined>
    ) {
      if (!options.enabled) {
        throw new ServiceUnavailableException("Walking skeleton is disabled.");
      }

      let ctx;
      try {
        ctx = securityContextFromHeaders(headers);
      } catch (error) {
        if (error instanceof MissingSecurityContextError) {
          throw new ForbiddenException(error.message);
        }
        throw error;
      }
      requirePermission(ctx, "audit.read");

      if (!body?.message || typeof body.message !== "string") {
        throw new BadRequestException("message is required");
      }

      const ids = nextWalkingSkeletonIds();
      const result = await options.tracer.trace(ctx, body.message, ids);
      return { data: result };
    }
  }

  return WalkingSkeletonController;
}
