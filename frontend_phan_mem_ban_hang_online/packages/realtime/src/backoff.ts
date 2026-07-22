export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
}

/** Exponential backoff with full jitter and an upper bound (spec 12.4 step 2). */
export function computeBackoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const base = options.baseMs ?? 500;
  const max = options.maxMs ?? 30_000;
  const cap = Math.min(max, base * 2 ** attempt);
  return Math.random() * cap;
}
