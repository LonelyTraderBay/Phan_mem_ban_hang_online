# ADR-FE-018: Error format

**Status:** Accepted

## Context

Frontend error handling needs a machine-readable, versionable error shape it can reliably branch
on (retry? show a field error? show a conflict UI?) — matching on the human-readable `detail`
string is brittle and locale-dependent.

## Decision

RFC 9457 `application/problem+json` with project extensions (`code`, `request_id`, `trace_id`,
`retryable`, `field_errors`, `meta`) — the frontend always maps by `code`, never by `detail` text
(spec 11.3).

## Consequences

- `packages/api-client`'s `ProblemDetails` type and `parseProblemDetails` never throw on a
  malformed/non-JSON error body — confirmed as a real, fixed bug during F00 scaffolding: the
  initial `transport.ts` implementation let a 2xx response with an HTML body (e.g. a dev-server
  SPA-fallback page when no backend is running) throw an unhandled `SyntaxError` out of
  `bootstrapSession()`, silently hanging the app on the loading skeleton. Both the success-path
  and error-path JSON parsing are now wrapped and degrade to `{ ok: false }` (see
  `packages/api-client/src/tests/transport.test.ts`'s "does not throw" cases).
- `ErrorCode` is a generated union (`tooling/scripts/sync-backend-contracts.mjs` →
  `packages/api-client/src/generated/errorCodes.ts`) from the backend's real `error_catalog.csv`
  (73 codes at scaffold time) — `ProblemDetails.code` is compile-checked against the real catalog,
  not a free string.
- Field validation errors (`field_errors[].path`) map onto React Hook Form fields (ADR-FE-010);
  unmapped paths become a form-level error rather than being dropped.
