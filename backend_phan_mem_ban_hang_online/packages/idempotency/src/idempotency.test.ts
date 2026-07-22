import { describe, expect, it } from "vitest";
import { createTestSecurityContext } from "@ai-sales/test-utils";
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
  MemoryIdempotencyStore,
  __test
} from "./index.js";

describe("idempotency state machine", () => {
  const ctx = createTestSecurityContext();
  const request = {
    scope: "order.create",
    key: "key-1",
    requestHash: "hash-a",
    ttlSeconds: 3600
  };

  it("acquires new keys and replays completed responses", async () => {
    const store = new MemoryIdempotencyStore();
    expect(await store.reserve(ctx, request)).toEqual({ outcome: "acquired" });
    await store.complete(ctx, request, {
      resourceId: "ord_1",
      responseStatus: 201,
      responseBody: { password: "secret", ok: true }
    });
    const replay = await store.reserve(ctx, request);
    expect(replay.outcome).toBe("replay");
    if (replay.outcome === "replay") {
      expect(replay.record.responseBody).toEqual({ password: "[redacted]", ok: true });
      expect(replay.record.resourceId).toBe("ord_1");
    }
  });

  it("rejects different hash and in-progress conflicts", async () => {
    const store = new MemoryIdempotencyStore();
    await store.reserve(ctx, request);
    await expect(store.reserve(ctx, { ...request, requestHash: "hash-b" })).rejects.toBeInstanceOf(
      IdempotencyKeyReusedError
    );
    await expect(store.reserve(ctx, request)).rejects.toBeInstanceOf(IdempotencyInProgressError);
  });

  it("allows retry after failed_retryable but not failed_final", async () => {
    const store = new MemoryIdempotencyStore();
    await store.reserve(ctx, request);
    await store.fail(ctx, request, { retryable: true });
    expect(await store.reserve(ctx, request)).toEqual({ outcome: "acquired" });
    await store.fail(ctx, request, { retryable: false });
    await expect(store.reserve(ctx, request)).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
  });

  it("decideReserve covers the four statuses", () => {
    const base = { requestHash: "h", expiresAt: new Date() };
    expect(__test.decideReserve(undefined, "h")).toBe("retry_acquire");
    expect(__test.decideReserve({ ...base, status: "failed_retryable" }, "h")).toBe("retry_acquire");
    expect(__test.decideReserve({ ...base, status: "completed", responseStatus: 200 }, "h")).toEqual({
      outcome: "replay",
      record: { ...base, status: "completed", responseStatus: 200 }
    });
    expect(() => __test.decideReserve({ ...base, status: "processing" }, "h")).toThrow(IdempotencyInProgressError);
    expect(() => __test.decideReserve({ ...base, status: "failed_final" }, "h")).toThrow(IdempotencyKeyReusedError);
    expect(() => __test.decideReserve({ ...base, status: "completed" }, "other")).toThrow(IdempotencyKeyReusedError);
  });
});
