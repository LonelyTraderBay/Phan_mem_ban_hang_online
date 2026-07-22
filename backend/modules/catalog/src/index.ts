export const MODULE_NAME = "catalog" as const;

export {
  archiveCategory,
  archiveProduct,
  archiveVariant,
  CatalogError,
  createCategory,
  createProduct,
  createVariant,
  getProduct,
  getVariantPricing,
  listCategories,
  listProducts,
  listVariants,
  listVariantPriceHistory,
  requireCatalogPermission,
  setVariantCost,
  updateCategory,
  updateProduct,
  updateVariant,
  type CatalogAuditRecord,
  type CatalogErrorCode,
  type CatalogPermission,
  type CatalogRepository,
  type CatalogResource,
  type CatalogStatus,
  type PriceHistoryRecord
} from "./application/catalog.js";

export { InMemoryCatalogRepository } from "./infrastructure/persistence/in-memory-catalog.js";
export { createCatalogController } from "./presentation/http/catalog.controller.js";
