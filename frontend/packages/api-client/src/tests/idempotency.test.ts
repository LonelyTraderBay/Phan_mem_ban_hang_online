import { describe, expect, it } from "vitest";
import { createIdempotencyKeyStore } from "../idempotency";

describe("createIdempotencyKeyStore", () => {
  it("returns the same key for retries of the same action", () => {
    let counter = 0;
    const store = createIdempotencyKeyStore(() => `key-${(counter += 1)}`);
    expect(store.getOrCreate("send-message-1")).toBe("key-1");
    expect(store.getOrCreate("send-message-1")).toBe("key-1");
  });

  it("generates a new key after reset (new payload / new action)", () => {
    let counter = 0;
    const store = createIdempotencyKeyStore(() => `key-${(counter += 1)}`);
    expect(store.getOrCreate("send-message-1")).toBe("key-1");
    store.reset("send-message-1");
    expect(store.getOrCreate("send-message-1")).toBe("key-2");
  });

  it("keeps separate keys per action id", () => {
    let counter = 0;
    const store = createIdempotencyKeyStore(() => `key-${(counter += 1)}`);
    expect(store.getOrCreate("action-a")).toBe("key-1");
    expect(store.getOrCreate("action-b")).toBe("key-2");
  });
});
