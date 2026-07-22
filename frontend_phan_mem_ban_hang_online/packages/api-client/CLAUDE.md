# @ai-sales/api-client

Typed transport, Problem Details parsing, idempotency/concurrency helpers (spec 11.2–11.8,
FE-F00-004). No React, no UI — this is the mandatory intermediary between
`@ai-sales/api-generated`'s raw types and feature code (see root CLAUDE.md's DTO→view-model rule).

- Errors are mapped by `code`, never by `detail` text (spec 11.3) — Problem Details follow RFC
  9457 (`application/problem+json`).
- `transport.ts` sends `X-Request-ID` on every request (ADR-FE-013); callers pass `idempotencyKey`
  and `ifMatch` explicitly for writes (spec 11.7/11.8) — this package doesn't infer them.
- `src/generated/errorCodes.ts` is generated from the backend's error catalog via
  `contracts:sync` — never hand-edit it (see `.claude/rules/contracts-codegen.md`).
- No codegen script of its own (that's `api-generated`'s job); standard `typecheck`/`lint`/`test`.
