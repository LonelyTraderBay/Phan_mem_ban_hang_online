import { queryOptions } from "@tanstack/react-query";
import type { ApiClient, TenantApiComponents } from "@ai-sales/api-client";
import { createResourceQueryKeys } from "@ai-sales/state";
import { toCatalogItem } from "./products.mapper";
import type { CatalogItem } from "../domain/catalogItem";

export const productCatalogQueryKeys = createResourceQueryKeys("product-catalog");

// Reuses the generated GenericListResponse/GenericResource schemas — this file (api/*.mapper.ts
// and its sibling *.queries.ts) is the one place allowed to reference @ai-sales/api-generated
// types (via @ai-sales/api-client's re-export), per spec 3.4.
type GenericListResponseDto = TenantApiComponents["schemas"]["GenericListResponse"];

export class CatalogRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CatalogRequestError";
  }
}

/**
 * `GET /products` (operationId `listProducts`, permission `catalog.read`) — read-only, so no
 * idempotency/concurrency handling is needed. staleTime is a provisional default pending
 * Performance/Product sign-off (spec 13.3), matching packages/state's documented policy.
 */
export function productCatalogListQueryOptions(apiClient: ApiClient, tenantScope: string) {
  return queryOptions({
    queryKey: productCatalogQueryKeys.list(tenantScope, {}),
    queryFn: async (): Promise<CatalogItem[]> => {
      const result = await apiClient.request<GenericListResponseDto>("/products");
      if (!result.ok) {
        throw new CatalogRequestError(result.problem?.detail ?? "Failed to load products", result.status);
      }
      return (result.data.data ?? []).map(toCatalogItem);
    },
    staleTime: 60_000,
  });
}
