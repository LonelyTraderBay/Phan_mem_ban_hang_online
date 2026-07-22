import { http, HttpResponse } from "msw";
import { buildSessionBootstrap } from "../factories/sessionBootstrap";

// Must match the generator's tenant-api base URL (generate-msw-fixtures.mjs).
const API_BASE_URL = "/api";

/**
 * Hand-written auth handlers (FE-F01-001/002):
 *
 * - `GET /me` → SessionBootstrap
 * - refresh / logout / switch-tenant / OIDC start+callback
 * - Use `server.use(...)` in tests for 401→refresh, refresh-reused, 403-no-refresh scenarios
 *
 * Paths are `*`-prefixed for Node vitest (absolute URL) and browser (relative).
 */
const authResponseBody = {
  data: {
    access_token: null,
    expires_in: null,
    mfa_required: false,
    mfa_challenge_id: null,
    session_id: "00000000-0000-0000-0000-000000000000",
  },
  meta: { request_id: "req_fixture" },
};

function problem(status: number, code: string, title: string) {
  return HttpResponse.json(
    {
      type: `https://api.ai-sales.local/problems/${code}`,
      title,
      status,
      code,
      detail: title,
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

/** Mutable scenario flags for READY-MOCK tests — reset via `resetAuthMswScenario()`. */
export const authMswScenario = {
  meStatus: 200 as 200 | 401,
  refreshBehavior: "ok" as "ok" | "reused" | "revoked",
  /** First N GETs to a protected path return 401 before succeeding (refresh retry demos). */
  force401Count: 0,
};

export function resetAuthMswScenario() {
  authMswScenario.meStatus = 200;
  authMswScenario.refreshBehavior = "ok";
  authMswScenario.force401Count = 0;
}

export const authHandlers = [
  http.get(`*${API_BASE_URL}/me`, () => {
    if (authMswScenario.meStatus === 401) {
      return problem(401, "AUTH_TOKEN_EXPIRED", "Session expired");
    }
    return HttpResponse.json(buildSessionBootstrap());
  }),

  http.post(`*${API_BASE_URL}/auth/refresh`, () => {
    if (authMswScenario.refreshBehavior === "reused") {
      return problem(401, "AUTH_REFRESH_REUSED", "Refresh token reused");
    }
    if (authMswScenario.refreshBehavior === "revoked") {
      return problem(401, "AUTH_SESSION_REVOKED", "Session revoked");
    }
    return HttpResponse.json(authResponseBody);
  }),

  http.post(`*${API_BASE_URL}/auth/logout`, () => HttpResponse.json({ data: {}, meta: { request_id: "req_logout" } })),

  http.post(`*${API_BASE_URL}/auth/switch-tenant`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { tenant_id?: string };
    return HttpResponse.json(
      buildSessionBootstrap({
        tenant: {
          id: body.tenant_id ?? "ten_switched",
          name: "Tenant đã chuyển",
          currency: "VND",
          timezone: "Asia/Ho_Chi_Minh",
        },
      }),
    );
  }),

  http.get(`*${API_BASE_URL}/auth/oidc/start`, ({ request }) => {
    const url = new URL(request.url);
    const returnTo = url.searchParams.get("return_to") ?? "/";
    // Simulate BFF→IdP→callback by redirecting to app callback with a fake code.
    const callback = `/auth/callback?return_to=${encodeURIComponent(returnTo)}&code=msw_oidc&state=msw`;
    return HttpResponse.redirect(callback, 302);
  }),

  http.get(`*${API_BASE_URL}/auth/oidc/callback`, ({ request }) => {
    const url = new URL(request.url);
    const returnTo = url.searchParams.get("return_to") ?? "/";
    return HttpResponse.redirect(returnTo.startsWith("/") ? returnTo : "/", 302);
  }),

  http.post(`*${API_BASE_URL}/auth/login`, () => HttpResponse.json(authResponseBody)),
  http.post(`*${API_BASE_URL}/invitations/accept`, () => HttpResponse.json(authResponseBody)),

  http.post(`*${API_BASE_URL}/auth/mfa/verify`, () => HttpResponse.json(authResponseBody)),
  http.post(`*${API_BASE_URL}/auth/password/forgot`, () =>
    HttpResponse.json({ data: {}, meta: { request_id: "req_forgot" } }),
  ),
  http.post(`*${API_BASE_URL}/auth/password/reset`, () =>
    HttpResponse.json({ data: {}, meta: { request_id: "req_reset" } }),
  ),
];

/** Helper: 401 once then 200 — for refresh-retry integration tests. */
export function onceUnauthorizedThenOk(
  pathSuffix: string,
  okBody: Record<string, unknown> = { data: {} },
) {
  let hits = 0;
  return http.get(`*${API_BASE_URL}${pathSuffix}`, () => {
    hits += 1;
    if (hits === 1) {
      return problem(401, "AUTH_TOKEN_EXPIRED", "Expired");
    }
    return HttpResponse.json(okBody);
  });
}

/** Helper: always 403 — refresh must not be called. */
export function alwaysForbidden(pathSuffix: string) {
  return http.get(`*${API_BASE_URL}${pathSuffix}`, () =>
    problem(403, "INSUFFICIENT_PERMISSION", "Forbidden"),
  );
}
