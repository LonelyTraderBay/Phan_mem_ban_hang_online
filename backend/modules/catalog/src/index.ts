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
  listCategories,
  listProducts,
  listVariants,
  requireCatalogPermission,
  updateCategory,
  updateProduct,
  updateVariant,
  type CatalogErrorCode,
  type CatalogPermission,
  type CatalogRepository,
  type CatalogResource,
  type CatalogStatus
} from "./application/catalog.js";

export { InMemoryCatalogRepository } from "./infrastructure/persistence/in-memory-catalog.js";
export { createCatalogController } from "./presentation/http/catalog.controller.js";
