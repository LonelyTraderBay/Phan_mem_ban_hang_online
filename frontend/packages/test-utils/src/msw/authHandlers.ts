import { http, HttpResponse } from "msw";
import { buildSessionBootstrap } from "../factories/sessionBootstrap";

// Must match the generator's tenant-api base URL (generate-msw-fixtures.mjs).
const API_BASE_URL = "/api";

/**
 * Hand-written auth handlers:
 *
 * - `GET /me`: OpenAPI now declares `SessionBootstrapResponse`, but the MSW generator still
 *   skips non-generic schemas — this override returns `buildSessionBootstrap()` so
 *   `bootstrapSession()` succeeds against MSW. Listed before generated handlers (first match).
 * - `POST /auth/login` / `POST /invitations/accept`: also generator-skipped (`AuthResponse`).
 *   Web Admin never reads `access_token` (ADR-FE-013).
 *
 * Refresh/logout/password ops may still use generated GenericDataResponse stubs where that is
 * the published contract shape.
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

// Paths are `*`-prefixed (any origin) unlike the generated relative-path handlers: in a Node
// vitest environment there is no `location`, so MSW can't resolve a relative handler path and
// fetch needs an absolute URL — `*${path}` matches both browser (relative) and Node (absolute).
export const authHandlers = [
  http.get(`*${API_BASE_URL}/me`, () => HttpResponse.json(buildSessionBootstrap())),
  http.post(`*${API_BASE_URL}/auth/login`, () => HttpResponse.json(authResponseBody)),
  http.post(`*${API_BASE_URL}/invitations/accept`, () => HttpResponse.json(authResponseBody)),
];
