import { describe, expect, it, vi } from "vitest";
import type { ApiClient, ApiResult } from "@ai-sales/api-client";
import { createAuthenticatedApiClient } from "../authenticatedClient";

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data, requestId: "r1" };
}

function fail(status: number, code: string): ApiResult<never> {
  return {
    ok: false,
    status,
    problem: {
      type: "t",
      title: code,
      status,
      code: code as never,
    },
  };
}

describe("createAuthenticatedApiClient", () => {
  it("retries once after 401 then succeeds", async () => {
    let calls = 0;
    const base: ApiClient = {
      request: vi.fn(async () => {
        calls += 1;
        if (calls === 1) return fail(401, "AUTH_TOKEN_EXPIRED");
        return ok({ n: 1 });
      }),
    };
    const refreshSession = vi.fn(async () => {});
    const onRefreshFailure = vi.fn(async () => {});
    const client = createAuthenticatedApiClient({ base, refreshSession, onRefreshFailure });

    const result = await client.request("/things");
    expect(result.ok).toBe(true);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(onRefreshFailure).not.toHaveBeenCalled();
  });

  it("does not refresh on 403", async () => {
    const base: ApiClient = {
      request: vi.fn(async () => fail(403, "INSUFFICIENT_PERMISSION")),
    };
    const refreshSession = vi.fn(async () => {});
    const onRefreshFailure = vi.fn(async () => {});
    const client = createAuthenticatedApiClient({ base, refreshSession, onRefreshFailure });

    const result = await client.request("/things");
    expect(result.ok).toBe(false);
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
