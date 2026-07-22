import { Queue } from "bullmq";
import { loadConfig } from "@ai-sales/config";
import { createLogger } from "@ai-sales/observability";

// Reuses the worker app's queue policy values (blueprint §9.6/§9.7); apps must not
// import each other, so the two constants used here are declared locally.
const MAINTENANCE_QUEUE = "maintenance.reconcile";
const RECONCILE_EVERY_MS = 5 * 60_000;

export async function startScheduler(): Promise<void> {
  const config = loadConfig({ ...process.env, SERVICE_NAME: process.env.SERVICE_NAME ?? "scheduler" });
  const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);

  if (!config.REDIS_URL) {
    logger.warn("REDIS_URL unset; scheduler idle without BullMQ job schedulers");
    return;
  }

  // Mirrors the worker's redisConnectionOptions (queueing.ts) — keep in sync.
  const parsed = new URL(config.REDIS_URL);
  const queue = new Queue(MAINTENANCE_QUEUE, {
    connection: {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      ...(parsed.password ? { password: parsed.password } : {}),
      ...(parsed.username ? { username: parsed.username } : {})
    }
  });

  // BullMQ job schedulers are deduplicated by scheduler id across instances, so
  // repeatable jobs need no separate leader election (blueprint BE-FND-011 lease/retry
  // semantics live in the worker's queueing.ts).
  await queue.upsertJobScheduler(
    "maintenance-reconcile-every-5m",
    { every: RECONCILE_EVERY_MS },
    { name: "maintenance.reconcile", data: {} }
  );
  logger.info({ queue: MAINTENANCE_QUEUE, everyMs: RECONCILE_EVERY_MS }, "job scheduler registered");

  const shutdown = async (): Promise<void> => {
    await queue.close();
    logger.info("scheduler shutdown complete");
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown().then(() => process.exit(0));
    });
  }
}

void startScheduler();
