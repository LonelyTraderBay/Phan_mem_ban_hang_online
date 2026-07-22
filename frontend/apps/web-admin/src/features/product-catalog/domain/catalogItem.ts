/**
 * The backend's `/products` contract (operationId `listProducts`) still returns the generic
 * placeholder `GenericResource` shape (id/version/created_at/updated_at + arbitrary properties)
 * — the real Product fields (name, SKU, price...) are not yet defined in the OpenAPI contract
 * (confirmed by reading contracts/openapi/tenant-api.yaml directly). Per spec 2.2 ("không tự
 * đoán business rule"), this view model does NOT invent field names for the missing schema —
 * unknown fields are kept in `raw` for display only, not asserted as any specific business
 * meaning. Replace this with a real Product domain type once F03 (Catalog) defines the contract.
 */
export interface CatalogItem {
  id: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  raw: Record<string, unknown>;
}
