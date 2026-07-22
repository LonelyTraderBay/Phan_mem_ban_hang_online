# ADR-FE-006: REST contract source

**Status:** Accepted

## Context

Backend and frontend must share request/response shapes without hand-written "shared types" that
drift from what the server actually implements (spec 11.1: "Không có shared-types viết tay giữa
Backend và Frontend").

## Decision

OpenAPI 3.1.1 is the single source of truth for REST. The generated client (`packages/api-generated`)
is regenerated in CI from `contracts/openapi/*.yaml`, and CI fails if regenerating produces an
uncommitted diff (`pnpm codegen:check-clean`).

## Consequences

- `tooling/scripts/sync-backend-contracts.mjs` copies/splits the backend's real
  `packages/contracts-http/openapi.yaml` (158 endpoints) into `contracts/openapi/tenant-api.yaml`
  (151 paths) and `ops-api.yaml` (7 `/super-admin/*` paths) — confirmed exact 1:1 with the
  `Operations` tag at scaffold time.
- Confirmed during F00 scaffolding: ~95% of the backend's response schemas are still the generic
  placeholder `GenericListResponse`/`GenericDataResponse` envelopes, not real per-resource
  schemas — the contract is genuinely a "starter," not frozen (matches the backend's own
  `GenericCommandRequest` schema description: "Starter placeholder. Replace with operation-specific
  schema before contract freeze."). MSW fixtures and the F00 sample feature (`product-catalog`)
  reflect this honestly rather than inventing business fields.
- `openapi-typescript` (types-only) was chosen over `orval` specifically so the mandatory DTO →
  view-model mapping step (spec 3.4, `api/*.mapper.ts`) cannot be bypassed by auto-generated
  hooks — see `packages/api-generated/README.md`.
