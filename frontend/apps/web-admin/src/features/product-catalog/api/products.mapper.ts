import type { TenantApiComponents } from "@ai-sales/api-client";
import type { CatalogItem } from "../domain/catalogItem";

// This is the one file allowed to import @ai-sales/api-generated types (via @ai-sales/api-client's
// re-export) — the ESLint boundary rule (spec 3.4/4.3) permits `api/*.mapper.ts` as the sole
// adapter point between generated types and the rest of the feature.
type GenericResourceDto = TenantApiComponents["schemas"]["GenericResource"];

export function toCatalogItem(dto: GenericResourceDto): CatalogItem {
  const { id, version, created_at, updated_at, ...rest } = dto;
  const item: CatalogItem = { id, raw: rest };
  if (version !== undefined) item.version = version;
  if (created_at !== undefined) item.createdAt = created_at;
  if (updated_at !== undefined) item.updatedAt = updated_at;
  return item;
}
