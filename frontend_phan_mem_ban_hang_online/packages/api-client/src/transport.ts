import type { RuntimeConfig } from "@ai-sales/config";
import type { TelemetryAdapter } from "@ai-sales/telemetry";
import { parseProblemDetails, type ProblemDetails } from "./problemDetails";

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: string;
}

export type ApiResult<T> =
  | { ok: true; data: T; requestId: string | null }
  | { ok: false; problem: ProblemDetails | null; status: number };

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>>;
}

export interface CreateApiClientOptions {
  config: RuntimeConfig;
  telemetry?: TelemetryAdapter;
  requestIdFactory?: () => string;
  fetchImpl?: typeof fetch;
}

/**
 * Thin typed fetch wrapper (spec 11.2/11.6, FE-F00-004 step 3). Sends `X-Request-ID` and
 * `X-Client-Version` on every request, `credentials: "same-origin"` for the BFF session cookie
 * (ADR-FE-013). Callers pass `idempotencyKey`/`ifMatch` explicitly per spec 11.7/11.8 — this
 * layer never invents one on its own.
 */
export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const requestIdFactory = options.requestIdFactory ?? (() => crypto.randomUUID());
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async request<T>(path: string, init: RequestOptions = {}): Promise<ApiResult<T>> {
      const { body, idempotencyKey, ifMatch, headers, ...rest } = init;
      const requestId = requestIdFactory();

      const finalHeaders = new Headers(headers);
      finalHeaders.set("X-Request-ID", requestId);
      finalHeaders.set("X-Client-Version", options.config.releaseVersion);
      if (body !== undefined) finalHeaders.set("Content-Type", "application/json");
      if (idempotencyKey) finalHeaders.set("Idempotency-Key", idempotencyKey);
      if (ifMatch) finalHeaders.set("If-Match", ifMatch);

      const requestInit: RequestInit = { ...rest, headers: finalHeaders, credentials: "same-origin" };
      if (body !== undefined) requestInit.body = JSON.stringify(body);

      let response: Response;
      try {
        response = await fetchImpl(`${options.config.apiBaseUrl}${path}`, requestInit);
      } catch (cause) {
        options.telemetry?.captureError(cause, { path, requestId });
        return { ok: false, problem: null, status: 0 };
      }

      if (!response.ok) {
        const problem = await parseProblemDetails(response.clone());
        return { ok: false, problem, status: response.status };
      }

      if (response.status === 204) {
        return { ok: true, data: undefined as T, requestId: response.headers.get("X-Request-ID") };
      }

      try {
        const data = (await response.json()) as T;
        return { ok: true, data, requestId: response.headers.get("X-Request-ID") };
      } catch (cause) {
        // A 2xx response with a body that isn't valid JSON (e.g. an HTML SPA fallback page
        // returned by a misconfigured proxy) must not throw — surface it as a normal failure.
        options.telemetry?.captureError(cause, { path, requestId, status: response.status });
        return { ok: false, problem: null, status: response.status };
      }
    },
  };
}
