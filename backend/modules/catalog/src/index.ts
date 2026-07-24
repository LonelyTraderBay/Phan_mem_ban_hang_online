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

export {
  attachProductMedia,
  createMediaUploadIntent,
  getSignedMediaDownloadUrl,
  markMediaUploadComplete,
  type MediaRepository,
  type MediaScanStatus,
  type MediaUploadRecord,
  type ProductMediaRecord
} from "./application/media.js";

export {
  analyzeImport,
  cancelImport,
  confirmImport,
  createImportJob,
  getImportErrors,
  getImportJob,
  getImportMetrics,
  getImportPreview,
  parseCsvStaging,
  updateImportMapping,
  type ImportApplyPort,
  type ImportJobRecord,
  type ImportJobResource,
  type ImportRepository,
  type ImportSourceType
} from "./application/import-jobs.js";

export { PostgresCatalogRepository } from "./infrastructure/persistence/postgres-catalog.js";
export {
  createInMemoryImportApplyPort,
  InMemoryImportRepository
} from "./infrastructure/persistence/in-memory-import.js";
export { PostgresImportRepository } from "./infrastructure/persistence/postgres-import.js";
export { createCatalogController } from "./presentation/http/catalog.controller.js";

