import { describe, expect, it } from "vitest";
import { createTestSecurityContext } from "@ai-sales/test-utils";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
  MemoryIdempotencyStore,
  runModuleIdempotent,
  runResourceIdempotent,
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

class DomainErr extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainErr";
  }
}

const tenantId = "018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e1b";
const actorId = "018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e2b";

describe("runModuleIdempotent", () => {
  it("replays completed body from MemoryIdempotencyStore", async () => {
    const store = new MemoryIdempotencyStore();
    let runs = 0;
    const run = () =>
      runModuleIdempotent({
        idempotency: store,
        tenantId,
        actorId,
        scope: "catalog.create",
        key: "k1",
        requestHash: "1",
        ttlSeconds: 3600,
        correlationId: "test",
        loadCached: async () => null,
        rememberCached: async () => undefined,
        execute: async () => {
          runs += 1;
          return { id: "c1", ok: true };
        },
        resourceId: (r) => r.id,
        mapInProgress: () => new DomainErr("in-progress"),
        mapKeyReused: () => new DomainErr("reused"),
        mapMissingReplay: () => new DomainErr("missing"),
        isDomainError: (e) => e instanceof DomainErr
      });

    const first = await run();
    const second = await run();
    expect(first).toEqual({ id: "c1", ok: true });
    expect(second).toEqual({ id: "c1", ok: true });
    expect(runs).toBe(1);
  });

  it("maps in-progress to domain error", async () => {
    const store = new MemoryIdempotencyStore();
    const ctx = createTestSecurityContext({
      tenantId: parseUuidV7(tenantId),
      actorId: parseUuidV7(actorId)
    });
    await store.reserve(ctx, {
      scope: "catalog.create",
      key: "busy",
      requestHash: "1",
      ttlSeconds: 3600
    });
    await expect(
      runModuleIdempotent({
        idempotency: store,
        tenantId,
        actorId,
        scope: "catalog.create",
        key: "busy",
        requestHash: "1",
        ttlSeconds: 3600,
        correlationId: "test",
        loadCached: async () => null,
        rememberCached: async () => undefined,
        execute: async () => ({ id: "x" }),
        mapInProgress: () => new DomainErr("in-progress"),
        mapKeyReused: () => new DomainErr("reused"),
        mapMissingReplay: () => new DomainErr("missing"),
        isDomainError: (e) => e instanceof DomainErr
      })
    ).rejects.toThrow("in-progress");
  });
});

describe("runResourceIdempotent", () => {
  it("replays via resourceId", async () => {
    const store = new MemoryIdempotencyStore();
    const resources = new Map<string, { id: string; n: number }>();
    let runs = 0;
    const run = () =>
      runResourceIdempotent({
        idempotency: store,
        tenantId,
        actorId,
        scope: "order.create",
        key: "o1",
        requestHash: "1",
        ttlSeconds: 3600,
        correlationId: "test",
        loadCached: async () => null,
        rememberCached: async (r) => {
          resources.set(r.id, r);
        },
        loadById: async (id) => resources.get(id) ?? null,
        toResult: (r) => ({ orderId: r.id, n: r.n }),
        execute: async () => {
          runs += 1;
          const resource = { id: "ord_1", n: 7 };
          resources.set(resource.id, resource);
          return { resource, result: { orderId: resource.id, n: resource.n } };
        },
        mapInProgress: () => new DomainErr("in-progress"),
        mapKeyReused: () => new DomainErr("reused"),
        mapMissingReplay: () => new DomainErr("missing"),
        isDomainError: (e) => e instanceof DomainErr
      });

    const first = await run();
    const second = await run();
    expect(first).toEqual({ orderId: "ord_1", n: 7 });
    expect(second).toEqual({ orderId: "ord_1", n: 7 });
    expect(runs).toBe(1);
  });
});
