# ADR-FE-013: Web authentication

**Status:** Accepted — Human Owner approved 2026-07-21

## Context

Storing an access/refresh token in JavaScript-reachable storage (localStorage, a JS variable) is
an XSS-exfiltration risk for a product handling customer PII and payment-adjacent data.

## Decision

OIDC Authorization Code flow via a BFF/same-origin gateway; the session is an `HttpOnly`,
`Secure`, `SameSite=Lax`-or-stricter cookie. JavaScript never sees the access/refresh token.
Internal email/password login is out of scope for Web Admin.

## Consequences

- `packages/api-client`'s `createApiClient` always sends `credentials: "same-origin"` — no
  `Authorization` header handling exists in the client by design.
- `packages/auth`'s `bootstrapSession` calls `GET /me` (confirmed real operationId
  `getCurrentContext`) to learn the authenticated identity/permissions; there is no client-side
  token to decode.
- Refresh is server-side (BFF) per spec 9.5 — the client's job (`packages/auth`'s
  `createSingleFlightRefresh`/`createRequestWithRefresh`) is coalescing concurrent 401s into one
  refresh call and retrying exactly once, not managing a refresh token itself.
- `GET /me` now returns the frozen `SessionBootstrapResponse` shape (spec 9.3). The hand-written
  MSW handler remains because the fixture generator intentionally skips non-generic schemas.
