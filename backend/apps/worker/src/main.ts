import { loadConfig } from "@ai-sales/config";
import { createDatabase } from "@ai-sales/database";
import { createLogger, startTracing } from "@ai-sales/observability";
import { claimAndMarkOutboxPublished } from "@ai-sales/outbox";
import { registerGracefulShutdown, type ShutdownHandle } from "./queueing.js";

const POLL_INTERVAL_MS = 2_000;

export async function startWorker(): Promise<ShutdownHandle> {
  const config = loadConfig({ ...process.env, SERVICE_NAME: process.env.SERVICE_NAME ?? "worker" });
  const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);
  const tracing = startTracing({ serviceName: config.SERVICE_NAME, otlpEndpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT });

  if (!config.DATABASE_URL) {
    logger.warn("DATABASE_URL unset; worker idle without outbox publisher");
    return registerGracefulShutdown([{ close: () => tracing.shutdown() }]);
  }

  const db = createDatabase(config.DATABASE_URL);
  logger.info("worker started; polling unpublished outbox");

  const tick = async (): Promise<void> => {
    try {
      const claimed = await claimAndMarkOutboxPublished(db, 50);
      if (claimed.length > 0) {
        logger.info({ count: claimed.length, ids: claimed.map((r) => r.id) }, "outbox_published");
      }
    } catch (error) {
      logger.error({ err: error instanceof Error ? error.message : "unknown" }, "outbox_publish_failed");
    }
  };

  await tick();
  const interval = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);

  // BullMQ queue workers (blueprint §9.6 topology, createQueueWorker) are attached
  // here by the module tickets that own each processor — P1 ships the primitives.
  return registerGracefulShutdown(
    [
      { close: () => clearInterval(interval) },
      { close: () => db.destroy() },
      { close: () => tracing.shutdown() },
      { close: () => logger.info("worker shutdown complete") }
    ],
    { onError: (error) => logger.error({ err: error instanceof Error ? error.message : "unknown" }, "shutdown_error") }
  );
}

void startWorker();
