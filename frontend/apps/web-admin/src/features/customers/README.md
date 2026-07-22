# customers

## Mục tiêu

FE P3 slice — danh sách, chi tiết và gộp khách hàng (READY-MOCK). Inline fetch trong route, cùng pattern với `settings/`.

## Routes

- `/customers` — `CustomersListRoute`
- `/customers/:customerId` — `CustomerDetailRoute`
- `/customers/merge` — `CustomerMergeRoute`

## Permissions

- `customer.read` — list + detail
- `customer.merge` — merge preview + merge

## API

- `GET /customers`, `GET /customers/:id`
- `POST /customers/merge-preview`, `POST /customers/merge`

MSW overrides: `@ai-sales/test-utils` → `customerHandlers`.

## Test

`pnpm --filter @ai-sales/test-utils test`
