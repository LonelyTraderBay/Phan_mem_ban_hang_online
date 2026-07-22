import { useQuery } from "@tanstack/react-query";
import { useApiClient, useTenantScope } from "../../../app/ApiClientContext";
import { productCatalogListQueryOptions } from "../api/products.queries";

export function useProductCatalog() {
  const apiClient = useApiClient();
  const tenantScope = useTenantScope();
  return useQuery(productCatalogListQueryOptions(apiClient, tenantScope));
}
