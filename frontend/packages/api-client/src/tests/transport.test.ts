import { describe, expect, it } from "vitest";
import { createApiClient } from "../transport";
import type { RuntimeConfig } from "@ai-sales/config";

const baseConfig: RuntimeConfig = {
  environment: "local",
  apiBaseUrl: "/api",
  sseUrl: "/events",
  oidcClientId: "web-admin",
  releaseVersion: "0.1.0",
  buildSha: "deadbeef",
  telemetryEnabled: false,
  supportUrl: "/help",
};

function fakeFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => handler(input, init)) as unknown as typeof fetch;
}

describe("createApiClient", () => {
  it("sends X-Request-ID and X-Client-Version on every request", async () => {
    let capturedHeaders: Headers | undefined;
    const client = createApiClient({
      config: baseConfig,
      requestIdFactory: () => "req_fixed",
      fetchImpl: fakeFetch((_input, init) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ hello: "world" }), { status: 200 });
      }),
    });

    const result = await client.request<{ hello: string }>("/ping");

    expect(capturedHeaders?.get("X-Request-ID")).toBe("req_fixed");
    expect(capturedHeaders?.get("X-Client-Version")).toBe("0.1.0");
    expect(result).toEqual({ ok: true, data: { hello: "world" }, requestId: null });
  });

  it("attaches Idempotency-Key and If-Match only when provided", async () => {
    let capturedHeaders: Headers | undefined;
    const client = createApiClient({
      config: baseConfig,
      fetchImpl: fakeFetch((_input, init) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(null, { status: 204 });
      }),
    });

    await client.request("/orders", { method: "POST", idempotencyKey: "idem_1", ifMatch: "etag_1" });

    expect(capturedHeaders?.get("Idempotency-Key")).toBe("idem_1");
    expect(capturedHeaders?.get("If-Match")).toBe("etag_1");
  });

  it("returns ok:false with a parsed Problem Details on a non-2xx response", async () => {
    const problem = {
      type: "https://errors.example.com/order/version-conflict",
      title: "Order version conflict",
      status: 409,
      code: "ORDER_VERSION_CONFLICT",
    };
    const client = createApiClient({
      config: baseConfig,
      fetchImpl: fakeFetch(
        () =>
          new Response(JSON.stringify(problem), {
            status: 409,
            headers: { "content-type": "application/problem+json" },
          }),
      ),
    });

    const result = await client.request("/orders/ord_1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.problem?.code).toBe("ORDER_VERSION_CONFLICT");
    }
  });

  it("does not throw on a network failure — returns ok:false", async () => {
    const client = createApiClient({
      config: baseConfig,
      fetchImpl: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });

    const result = await client.request("/ping");
    expect(result).toEqual({ ok: false, problem: null, status: 0 });
  });

  it("does not throw when a 2xx response body is not valid JSON (e.g. an SPA-fallback HTML page)", async () => {
    const client = createApiClient({
      config: baseConfig,
      fetchImpl: fakeFetch(() => new Response("<!doctype html><html></html>", { status: 200 })),
    });

    const result = await client.request("/me");
    expect(result).toEqual({ ok: false, problem: null, status: 200 });
  });
});
