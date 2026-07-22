import { describe, expect, it } from "vitest";
import {
  backoffDelayMs,
  DEFAULT_JOB_OPTIONS,
  JOB_LOCK_DURATION_MS,
  QUEUE_NAMES,
  redisConnectionOptions,
  registerGracefulShutdown,
  RETRY_BACKOFF_LADDER_MS
} from "./queueing.js";

describe("queue topology (blueprint §9.6)", () => {
  it("declares the nine mandated queues", () => {
    expect([...QUEUE_NAMES]).toEqual([
      "webhook.process",
      "message.send",
      "ai.suggest",
      "knowledge.ingest",
      "import.apply",
      "inventory.expire",
      "analytics.project",
      "notification.emit",
      "maintenance.reconcile"
    ]);
  });
});

describe("retry backoff ladder (blueprint §9.7)", () => {
  it("follows 5s/30s/2m/10m/30m and caps at the last rung", () => {
    expect(backoffDelayMs(1)).toBe(5_000);
    expect(backoffDelayMs(2)).toBe(30_000);
    expect(backoffDelayMs(3)).toBe(120_000);
    expect(backoffDelayMs(4)).toBe(600_000);
    expect(backoffDelayMs(5)).toBe(1_800_000);
    expect(backoffDelayMs(99)).toBe(1_800_000);
    expect(backoffDelayMs(0)).toBe(5_000);
  });

  it("job options exhaust the ladder then keep the job as DLQ evidence", () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(RETRY_BACKOFF_LADDER_MS.length);
    expect(DEFAULT_JOB_OPTIONS.backoff).toEqual({ type: "custom" });
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toBe(false);
  });

  it("workers hold a bounded job lease", () => {
    expect(JOB_LOCK_DURATION_MS).toBe(30_000);
  });
});

describe("redisConnectionOptions", () => {
  it("parses url with credentials and requires no request retries", () => {
    expect(redisConnectionOptions("redis://user:pw@redis.local:6380")).toEqual({
      host: "redis.local",
      port: 6380,
      username: "user",
      password: "pw",
      maxRetriesPerRequest: null
    });
  });

  it("defaults port to 6379", () => {
    expect(redisConnectionOptions("redis://localhost").port).toBe(6379);
  });
});

describe("registerGracefulShutdown", () => {
  it("closes everything in order, exactly once, and swallows close errors", async () => {
    const closed: string[] = [];
    const errors: unknown[] = [];
    const handle = registerGracefulShutdown(
      [
        { close: () => closed.push("worker") },
        {
          close: () => {
            throw new Error("redis already gone");
          }
        },
        { close: async () => void closed.push("db") }
      ],
      { onError: (error) => errors.push(error), signals: [] }
    );

    await handle.shutdown();
    await handle.shutdown();

    expect(closed).toEqual(["worker", "db"]);
    expect(errors).toHaveLength(1);
  });
});
