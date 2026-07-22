import "reflect-metadata";
import { loadConfig } from "@ai-sales/config";
import { createLogger, logHttpRequest, startTracing } from "@ai-sales/observability";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { ProblemDetailsFilter } from "./problem-details.filter";
import { registerRequestIdMiddleware } from "./request-id.middleware";

async function bootstrap(): Promise<void> {
  const config = loadConfig({ ...process.env, SERVICE_NAME: process.env.SERVICE_NAME ?? "api" });
  const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);
  const tracing = startTracing({ serviceName: config.SERVICE_NAME, otlpEndpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(), new FastifyAdapter(), {
    bufferLogs: true
  });

  registerRequestIdMiddleware(app);
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onResponse", async (request, reply) => {
    const correlationId =
      typeof request.headers["x-correlation-id"] === "string" ? request.headers["x-correlation-id"] : undefined;
    const requestId =
      typeof request.headers["x-request-id"] === "string" ? request.headers["x-request-id"] : undefined;
    logHttpRequest(logger, {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime ?? 0),
      ...(correlationId !== undefined ? { correlationId } : {}),
      ...(requestId !== undefined ? { requestId } : {})
    });
  });

  await app.listen(config.PORT, "0.0.0.0");
  logger.info({ port: config.PORT }, "api started");

  // Graceful shutdown (blueprint §16.4): stop accepting requests, drain
  // in-flight, then flush buffered spans and unregister the tracer provider.
  let shuttingDown = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      void app
        .close()
        .then(() => tracing.shutdown())
        .catch((error: unknown) =>
          logger.error({ err: error instanceof Error ? error.message : "unknown" }, "shutdown_error")
        )
        .finally(() => process.exit(0));
    });
  }
}

void bootstrap();
