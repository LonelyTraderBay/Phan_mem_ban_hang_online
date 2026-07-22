import { describe, expect, it } from "vitest";
import { createQueryClient } from "../queryClientFactory";

describe("createQueryClient retry policy (spec 11.10)", () => {
  const client = createQueryClient("local");
  const retry = client.getDefaultOptions().queries?.retry as (count: number, error: unknown) => boolean;

  it("retries network/502/503/504 up to 2 times", () => {
    expect(retry(0, { status: 0 })).toBe(true);
    expect(retry(1, { status: 502 })).toBe(true);
    expect(retry(2, { status: 503 })).toBe(false);
  });

  it("does not blind-retry 429 beyond one attempt", () => {
    expect(retry(0, { status: 429 })).toBe(true);
    expect(retry(1, { status: 429 })).toBe(false);
  });

  it("does not retry 400/401/403/404/409/412/422", () => {
    for (const status of [400, 401, 403, 404, 409, 412, 422]) {
      expect(retry(0, { status })).toBe(false);
    }
  });

  it("never auto-retries mutations", () => {
    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  });
});
