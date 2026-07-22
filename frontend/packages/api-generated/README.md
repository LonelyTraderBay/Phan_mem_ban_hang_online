# @ai-sales/api-generated

Generated TypeScript types only — zero runtime code, zero opinion about fetch/query (spec 3.4,
FE-F00-004). `packages/api-client` sits between this package and features, providing the typed
transport, Problem Details parsing, idempotency/concurrency helpers, and the DTO → view-model
mapping that features must go through.

## Never hand-edit `src/generated/`

Run `pnpm codegen:api` (from repo root) to regenerate after `pnpm contracts:sync`. CI re-runs
codegen and fails the build if `git diff` is non-empty (`codegen:check-clean`), so contract
changes surface as a reviewable diff instead of silent drift.

## Why `openapi-typescript`, not `orval`

`orval` can generate TanStack Query hooks directly from the OpenAPI spec, but that would let
features skip the mandatory DTO → view-model mapping step (spec 3.4). `openapi-typescript`
produces types only, so the mapping layer in `packages/api-client`/`feature/api/*.mapper.ts`
stays mandatory rather than optional.
