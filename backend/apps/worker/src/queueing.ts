import { Queue, Worker, type Processor, type RedisOptions } from "bullmq";

/** Queue topology per blueprint §9.6 — payloads carry IDs/refs, never full PII/content. */
export const QUEUE_NAMES = [
  "webhook.process",
  "message.send",
  "ai.suggest",
  "knowledge.ingest",
  "import.apply",
  "inventory.expire",
  "analytics.project",
  "notification.emit",
  "maintenance.reconcile"
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/** Default retry backoff ladder per blueprint §9.7: 5s/30s/2m/10m/30m. */
export const RETRY_BACKOFF_LADDER_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000] as const;

export function backoffDelayMs(attemptsMade: number): number {
  const index = Math.min(Math.max(attemptsMade, 1), RETRY_BACKOFF_LADDER_MS.length) - 1;
  return RETRY_BACKOFF_LADDER_MS[index] as number;
}

/** Max attempts = ladder length; exhausted jobs stay in failed set as the DLQ. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: RETRY_BACKOFF_LADDER_MS.length,
  backoff: { type: "custom" as const },
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: false as const
};

/** Job lease per blueprint §9.4/§19.3 — a stalled worker loses the lock and the job is retried. */
export const JOB_LOCK_DURATION_MS = 30_000;

export function redisConnectionOptions(redisUrl: string): RedisOptions {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.password ? { password: parsed.password } : {}),
    ...(parsed.username ? { username: parsed.username } : {}),
    // BullMQ requirement for blocking workers.
    maxRetriesPerRequest: null
  };
}

export function createQueue(name: QueueName, redisUrl: string): Queue {
  return new Queue(name, {
    connection: redisConnectionOptions(redisUrl),
    defaultJobOptions: DEFAULT_JOB_OPTIONS
  });
}

export function createQueueWorker(name: QueueName, processor: Processor, redisUrl: string): Worker {
  return new Worker(name, processor, {
    connection: redisConnectionOptions(redisUrl),
    lockDuration: JOB_LOCK_DURATION_MS,
    settings: {
      backoffStrategy: (attemptsMade: number) => backoffDelayMs(attemptsMade)
    }
  });
}

export interface Closeable {
  close(): Promise<unknown> | unknown;
}

export interface ShutdownHandle {
  /** Runs every close exactly once (idempotent); safe to call directly in tests. */
  shutdown(): Promise<void>;
}

/**
 * Graceful shutdown per blueprint §19.3 (BE-FND-011): SIGINT/SIGTERM drain
 * workers/queues/pools in registration order before the process exits.
 */
export function registerGracefulShutdown(
  closeables: readonly Closeable[],
  options: { readonly onError?: (error: unknown) => void; readonly signals?: readonly NodeJS.Signals[] } = {}
): ShutdownHandle {
  let done: Promise<void> | undefined;
  const shutdown = async (): Promise<void> => {
    done ??= (async () => {
      for (const closeable of closeables) {
        try {
          await closeable.close();
        } catch (error) {
          options.onError?.(error);
        }
      }
    })();
    await done;
  };
  for (const signal of options.signals ?? (["SIGINT", "SIGTERM"] as const)) {
    process.once(signal, () => {
      void shutdown().then(() => process.exit(0));
    });
  }
  return { shutdown };
}
