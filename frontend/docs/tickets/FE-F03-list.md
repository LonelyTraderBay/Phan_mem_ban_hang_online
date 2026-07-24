# FE-F03 — Products + Customers (Wave 1)

**Status:** READY-MOCK polish complete  
**Date:** 2026-07-23  
**Scope:** Wave 1 F03 — product catalog, import jobs, customer list/detail/merge

## Delivered

- [x] `ProductCatalogScreen` — ContentArea/PageHeader/Card/DataList; name+SKU from API `raw`; ForbiddenState via PermissionGate
- [x] `ProductDetailRoute` — conflict on PATCH → ErrorPanel `RESOURCE_VERSION_MISMATCH` + reload; Toast on save
- [x] `ProductImportRoute` / `ProductImportJobRoute` — design-system layout (prior pass); MSW `importHandlers`
- [x] `CustomersListRoute` / `CustomerDetailRoute` / `CustomerMergeRoute` — Card/DataList polish; merge requires server preview
- [x] MSW: `catalogHandlers` (3 products, If-Match conflict), `customerHandlers` (3 customers, merge-preview validation)
- [x] Session bootstrap includes `catalog.*` + `customer.*` permissions

## States (READY-MOCK)

| Screen | happy | empty | loading | error | forbidden | conflict |
|---|---|---|---|---|---|---|
| `/products` | DataList | EmptyState | Skeleton | ErrorPanel+retry | PermissionGate | — |
| `/products/:id` | Card form | EmptyState | Skeleton | ErrorPanel+retry | PermissionGate | RESOURCE_VERSION_MISMATCH |
| `/products/import*` | Card wizard | EmptyState | Skeleton | ErrorPanel | PermissionGate | — |
| `/customers` | DataList | EmptyState | Skeleton | ErrorPanel+retry | PermissionGate | — |
| `/customers/:id` | Card detail | EmptyState | Skeleton | ErrorPanel+retry | PermissionGate | — |
| `/customers/merge` | preview Card | — | — | ErrorPanel | PermissionGate | — |

## Verify locally

```sh
pnpm --filter @ai-sales/web-admin typecheck
```

## Not in scope

- Real Product OpenAPI fields (still `GenericResource` + `raw`)
- DataTable / file upload dropzone (MISSING COMPONENT per `products.md`)
- READY-INTEGRATION against staging catalog API
