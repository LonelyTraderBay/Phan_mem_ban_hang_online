import { describe, expect, it, vi } from "vitest";
import { createRequestWithRefresh, createSingleFlightRefresh } from "../refresh";

describe("createSingleFlightRefresh", () => {
  it("only runs one refresh at a time for concurrent callers", async () => {
    let calls = 0;
    const refresh = createSingleFlightRefresh(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await Promise.all([refresh(), refresh(), refresh()]);
    expect(calls).toBe(1);
  });

  it("allows a new refresh after the previous one settles", async () => {
    let calls = 0;
    const refresh = createSingleFlightRefresh(async () => {
      calls += 1;
    });
    await refresh();
    await refresh();
    expect(calls).toBe(2);
  });
});

describe("createRequestWithRefresh", () => {
  it("retries exactly once after a 401, then stops regardless of outcome", async () => {
    const refresh = vi.fn(async () => {});
    const withRefresh = createRequestWithRefresh(refresh);
    const attempt = vi.fn(async () => ({ status: 401, result: null }));

    const outcome = await withRefresh(attempt);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(outcome.status).toBe(401);
  });

  it("does not call refresh at all when the first attempt succeeds", async () => {
    const refresh = vi.fn(async () => {});
    const withRefresh = createRequestWithRefresh(refresh);
    const attempt = vi.fn(async () => ({ status: 200, result: "ok" }));

    await withRefresh(attempt);

    expect(refresh).not.toHaveBeenCalled();
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
