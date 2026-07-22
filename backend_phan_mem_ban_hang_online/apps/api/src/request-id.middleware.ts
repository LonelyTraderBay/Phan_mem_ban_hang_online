import { createCorrelationId } from "@ai-sales/observability";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim().length > 0) {
    return value[0].trim();
  }
  return undefined;
}

/** Ensures X-Request-Id and X-Correlation-Id on every request/response. */
export function registerRequestIdMiddleware(app: NestFastifyApplication): void {
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onRequest", async (request, reply) => {
    const requestId = firstHeader(request.headers["x-request-id"]) ?? createCorrelationId();
    const correlationId =
      firstHeader(request.headers["x-correlation-id"]) ?? requestId;
    request.headers["x-request-id"] = requestId;
    request.headers["x-correlation-id"] = correlationId;
    void reply.header("x-request-id", requestId);
    void reply.header("x-correlation-id", correlationId);
  });
}
