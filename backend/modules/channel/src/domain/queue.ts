/**
 * BE-CHN-007 — Queue retry/backoff/DLQ/reprocess stubs.
 */

export type QueueJobStatus = "pending" | "processing" | "completed" | "retry" | "dead_letter";

export interface QueueJobRecord {
  readonly jobId: string;
  readonly queueName: string;
  readonly payloadRef: string;
  readonly status: QueueJobStatus;
  readonly attemptCount: number;
  readonly nextAttemptAt: string | null;
  readonly lastError: string | null;
}

const BACKOFF_SECONDS = [5, 30, 120, 600, 1800] as const;

export function computeNextBackoff(attemptCount: number): number {
  const index = Math.min(Math.max(attemptCount - 1, 0), BACKOFF_SECONDS.length - 1);
  return BACKOFF_SECONDS[index] ?? 1800;
}

export function scheduleRetryAt(attemptCount: number, now = new Date()): string {
  const seconds = computeNextBackoff(attemptCount);
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

export function shouldMoveToDlq(attemptCount: number, maxAttempts = 5): boolean {
  return attemptCount >= maxAttempts;
}

export function classifyQueueError(error: unknown): "retry" | "dead_letter" {
  const message = error instanceof Error ? error.message : String(error);
  if (/validation|signature|permission/i.test(message)) return "dead_letter";
  return "retry";
}
