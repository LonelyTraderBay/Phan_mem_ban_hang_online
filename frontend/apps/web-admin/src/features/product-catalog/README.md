# product-catalog

## Mục tiêu

F00 sample feature — proves the full layer/import-boundary chain compiles and lints cleanly
(route → component → hook → domain mapper + query factory → generated API client → transport),
exercising `@ai-sales/api-client`, `@ai-sales/state` (query key factory), `@ai-sales/permissions`
(gate), and `@ai-sales/ui` together (F00.6 exit criterion). Not a real Catalog feature — F03
(Product/Variant/Category/Import) replaces this once the backend contract for Product is real.

## Route

`/products` (web-admin only).

## Permission

`catalog.read` (read-only — this feature never writes).

## Feature flags

None.

## API/event dependency

- `GET /products` (operationId `listProducts`) — contract still returns the generic
  `GenericResource` placeholder shape (id/version/created_at/updated_at + arbitrary fields), not
  a real Product schema. See `domain/catalogItem.ts` for why the view model does not invent
  business fields.
- No realtime event dependency.

## Query keys

`productCatalogQueryKeys` from `api/products.queries.ts`, built via
`@ai-sales/state`'s `createResourceQueryKeys("product-catalog")` — tenant-scoped
(`["tenant", tenantScope, "product-catalog", ...]`).

## State machine

None — read-only list, no entity state transitions.

## PII fields

None — `GenericResource`'s fields today are non-PII (id/version/timestamps).

## Test commands

`pnpm --filter @ai-sales/web-admin test`

## Owner

Frontend Platform team (F00 scaffold) — reassign to the Catalog feature owner when F03 replaces
this.
