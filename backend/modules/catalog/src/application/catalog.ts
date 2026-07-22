import { DomainInvariantError, generateUuidV7, Money, type UuidV7 } from "@ai-sales/domain-kernel";

/**
 * BE-CAT-002 — Product/category/variant CRUD + ETag.
 * Mirrors BE-IDN-010 style (modules/tenant: members.ts + members-roles.controller.ts + in-memory repo).
 */

export type CatalogStatus = "draft" | "active" | "archived";
export type CatalogPermission = "catalog.read" | "catalog.write";

export type CatalogErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_VERSION_MISMATCH"
  | "SKU_DUPLICATE"
  | "BARCODE_DUPLICATE"
  | "CATEGORY_CYCLE"
  | "PRODUCT_ARCHIVED"
  | "IDEMPOTENCY_KEY_REQUIRED";

export class CatalogError extends Error {
  constructor(
    message: string,
    readonly code: CatalogErrorCode
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

/**
 * Frozen resource schema for OpenAPI tag Catalog (enterprise doc-freeze W1) — shared by
 * categories, products, and variants. Variants map their SKU onto `name` and have no
 * category/brand of their own; categories reuse `category_id` to carry their parent id
 * since the frozen schema has no dedicated `parent_id` field. unit_price_minor, cost_minor,
 * currency, and barcode are variant-internal only (not part of this contract) — see
 * infrastructure/persistence/in-memory-catalog.ts.
 */
export interface CatalogResource {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category_id: string | null;
  readonly brand: string | null;
  readonly status: CatalogStatus;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CatalogRepository {
  // Categories
  createCategory(args: {
    readonly tenantId: string;
    readonly categoryId: UuidV7;
    readonly name: string;
    readonly parentId: string | null;
  }): Promise<CatalogResource>;
  listCategories(tenantId: string): Promise<readonly CatalogResource[]>;
  updateCategory(args: {
    readonly tenantId: string;
    readonly categoryId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
    readonly parentId: string | null | undefined;
  }): Promise<CatalogResource>;
  archiveCategory(args: {
    readonly tenantId: string;
    readonly categoryId: string;
    readonly expectedVersion: number | null;
  }): Promise<CatalogResource>;

  // Products
  createProduct(args: {
    readonly tenantId: string;
    readonly productId: UuidV7;
    readonly name: string;
    readonly description: string | null;
    readonly categoryId: string | null;
    readonly brand: string | null;
    readonly status: "draft" | "active";
  }): Promise<CatalogResource>;
  listProducts(tenantId: string): Promise<readonly CatalogResource[]>;
  getProduct(args: { readonly tenantId: string; readonly productId: string }): Promise<CatalogResource>;
  updateProduct(args: {
    readonly tenantId: string;
    readonly productId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
    readonly description: string | null | undefined;
    readonly categoryId: string | null | undefined;
    readonly brand: string | null | undefined;
    readonly status: "draft" | "active" | null | undefined;
  }): Promise<CatalogResource>;
  archiveProduct(args: {
    readonly tenantId: string;
    readonly productId: string;
    readonly expectedVersion: number | null;
  }): Promise<CatalogResource>;

  // Variants
  createVariant(args: {
    readonly tenantId: string;
    readonly productId: string;
    readonly variantId: UuidV7;
    readonly sku: string;
    readonly unitPriceMinor: number;
    readonly currency: string;
    readonly costMinor: number | null;
    readonly barcode: string | null;
  }): Promise<CatalogResource>;
  listVariants(tenantId: string): Promise<readonly CatalogResource[]>;
  updateVariant(args: {
    readonly tenantId: string;
    readonly variantId: string;
    readonly expectedVersion: number;
    readonly unitPriceMinor: number | null | undefined;
    readonly status: "active" | "archived" | null | undefined;
  }): Promise<CatalogResource>;
  archiveVariant(args: {
    readonly tenantId: string;
    readonly variantId: string;
    readonly expectedVersion: number | null;
  }): Promise<CatalogResource>;

  // Idempotency (create*/archive* per OpenAPI x-idempotency: required) — simple
  // tenant+key -> last resource map; a Postgres adapter can later back this with
  // @ai-sales/idempotency's request-hash store.
  getIdempotentResult(tenantId: string, key: string): Promise<CatalogResource | null>;
  saveIdempotentResult(tenantId: string, key: string, resource: CatalogResource): Promise<void>;
}

export function requireCatalogPermission(
  actorPermissions: readonly string[],
  permission: CatalogPermission
): void {
  if (!actorPermissions.includes(permission)) {
    throw new CatalogError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

function validateMoney(unitPriceMinor: number, currency: string): void {
  try {
    Money.fromMinorUnits(unitPriceMinor, currency);
  } catch (error) {
    if (error instanceof DomainInvariantError) {
      throw new CatalogError(error.message, "VALIDATION_FAILED");
    }
    throw error;
  }
  if (unitPriceMinor < 0) {
    throw new CatalogError("unit_price_minor must not be negative.", "VALIDATION_FAILED");
  }
}

/** create/archive ops require Idempotency-Key (OpenAPI x-idempotency: required); replay returns the same resource. */
async function withIdempotency(
  repo: CatalogRepository,
  tenantId: string,
  idempotencyKey: string | null | undefined,
  run: () => Promise<CatalogResource>
): Promise<CatalogResource> {
  const key = idempotencyKey?.trim();
  if (!key) {
    throw new CatalogError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const cached = await repo.getIdempotentResult(tenantId, key);
  if (cached) return cached;
  const result = await run();
  await repo.saveIdempotentResult(tenantId, key, result);
  return result;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}): Promise<{
  readonly data: readonly CatalogResource[];
  readonly page_info: { readonly next_cursor: null; readonly has_more: false };
  readonly meta: Record<string, never>;
}> {
  requireCatalogPermission(options.actorPermissions, "catalog.read");
  const data = await options.repo.listCategories(options.tenantId);
  return { data, page_info: { next_cursor: null, has_more: false }, meta: {} };
}

export async function createCategory(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly name: string;
  readonly parentId?: string | null;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const name = options.name?.trim() ?? "";
    if (!name || name.length > 200) {
      throw new CatalogError("Invalid category name.", "VALIDATION_FAILED");
    }
    return options.repo.createCategory({
      tenantId: options.tenantId,
      categoryId: generateUuidV7(),
      name,
      parentId: options.parentId ?? null
    });
  });
  return { data, meta: {} };
}

export async function updateCategory(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly categoryId: string;
  readonly expectedVersion: number;
  readonly name?: string | null;
  readonly parentId?: string | null;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  if (options.name != null && (!options.name.trim() || options.name.length > 200)) {
    throw new CatalogError("Invalid category name.", "VALIDATION_FAILED");
  }
  const data = await options.repo.updateCategory({
    tenantId: options.tenantId,
    categoryId: options.categoryId,
    expectedVersion: options.expectedVersion,
    name: options.name,
    parentId: options.parentId
  });
  return { data, meta: {} };
}

export async function archiveCategory(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly categoryId: string;
  readonly expectedVersion?: number | null;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, () =>
    options.repo.archiveCategory({
      tenantId: options.tenantId,
      categoryId: options.categoryId,
      expectedVersion: options.expectedVersion ?? null
    })
  );
  return { data, meta: {} };
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function listProducts(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}): Promise<{
  readonly data: readonly CatalogResource[];
  readonly page_info: { readonly next_cursor: null; readonly has_more: false };
  readonly meta: Record<string, never>;
}> {
  requireCatalogPermission(options.actorPermissions, "catalog.read");
  const data = await options.repo.listProducts(options.tenantId);
  return { data, page_info: { next_cursor: null, has_more: false }, meta: {} };
}

export async function createProduct(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly name: string;
  readonly description?: string | null;
  readonly categoryId?: string | null;
  readonly brand?: string | null;
  readonly status?: "draft" | "active" | null;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const name = options.name?.trim() ?? "";
    if (!name || name.length > 300) {
      throw new CatalogError("Invalid product name.", "VALIDATION_FAILED");
    }
    if (options.description != null && options.description.length > 20000) {
      throw new CatalogError("description too long.", "VALIDATION_FAILED");
    }
    if (options.brand != null && options.brand.length > 200) {
      throw new CatalogError("brand too long.", "VALIDATION_FAILED");
    }
    const status = options.status ?? "draft";
    if (status !== "draft" && status !== "active") {
      throw new CatalogError("Invalid status.", "VALIDATION_FAILED");
    }
    return options.repo.createProduct({
      tenantId: options.tenantId,
      productId: generateUuidV7(),
      name,
      description: options.description ?? null,
      categoryId: options.categoryId ?? null,
      brand: options.brand ?? null,
      status
    });
  });
  return { data, meta: {} };
}

export async function getProduct(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly productId: string;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.read");
  const data = await options.repo.getProduct({ tenantId: options.tenantId, productId: options.productId });
  return { data, meta: {} };
}

export async function updateProduct(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly productId: string;
  readonly expectedVersion: number;
  readonly name?: string | null;
  readonly description?: string | null;
  readonly categoryId?: string | null;
  readonly brand?: string | null;
  readonly status?: "draft" | "active" | null;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  if (options.name != null && (!options.name.trim() || options.name.length > 300)) {
    throw new CatalogError("Invalid product name.", "VALIDATION_FAILED");
  }
  if (options.brand != null && options.brand.length > 200) {
    throw new CatalogError("brand too long.", "VALIDATION_FAILED");
  }
  if (options.status != null && options.status !== "draft" && options.status !== "active") {
    throw new CatalogError("Invalid status.", "VALIDATION_FAILED");
  }
  const data = await options.repo.updateProduct({
    tenantId: options.tenantId,
    productId: options.productId,
    expectedVersion: options.expectedVersion,
    name: options.name,
    description: options.description,
    categoryId: options.categoryId,
    brand: options.brand,
    status: options.status
  });
  return { data, meta: {} };
}

export async function archiveProduct(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly productId: string;
  readonly expectedVersion?: number | null;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, () =>
    options.repo.archiveProduct({
      tenantId: options.tenantId,
      productId: options.productId,
      expectedVersion: options.expectedVersion ?? null
    })
  );
  return { data, meta: {} };
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export async function listVariants(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}): Promise<{
  readonly data: readonly CatalogResource[];
  readonly page_info: { readonly next_cursor: null; readonly has_more: false };
  readonly meta: Record<string, never>;
}> {
  requireCatalogPermission(options.actorPermissions, "catalog.read");
  const data = await options.repo.listVariants(options.tenantId);
  return { data, page_info: { next_cursor: null, has_more: false }, meta: {} };
}

export async function createVariant(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly productId: string;
  readonly sku: string;
  readonly unitPriceMinor?: number | null;
  readonly currency?: string | null;
  /** Internal-only (not on the frozen CreateVariantRequest contract); forward-compat for CAT-003. */
  readonly costMinor?: number | null;
  readonly barcode?: string | null;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const sku = options.sku?.trim() ?? "";
    if (!sku || sku.length > 100) {
      throw new CatalogError("Invalid sku.", "VALIDATION_FAILED");
    }
    const unitPriceMinor = options.unitPriceMinor ?? 0;
    const currency = (options.currency ?? "VND").trim().toUpperCase();
    validateMoney(unitPriceMinor, currency);
    const barcode = options.barcode?.trim() ? options.barcode.trim() : null;
    return options.repo.createVariant({
      tenantId: options.tenantId,
      productId: options.productId,
      variantId: generateUuidV7(),
      sku,
      unitPriceMinor,
      currency,
      costMinor: options.costMinor ?? null,
      barcode
    });
  });
  return { data, meta: {} };
}

export async function updateVariant(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly variantId: string;
  readonly expectedVersion: number;
  readonly unitPriceMinor?: number | null;
  readonly status?: "active" | "archived" | null;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  if (options.unitPriceMinor != null) {
    validateMoney(options.unitPriceMinor, "VND");
  }
  if (options.status != null && options.status !== "active" && options.status !== "archived") {
    throw new CatalogError("Invalid status.", "VALIDATION_FAILED");
  }
  const data = await options.repo.updateVariant({
    tenantId: options.tenantId,
    variantId: options.variantId,
    expectedVersion: options.expectedVersion,
    unitPriceMinor: options.unitPriceMinor,
    status: options.status
  });
  return { data, meta: {} };
}

export async function archiveVariant(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly variantId: string;
  readonly expectedVersion?: number | null;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, () =>
    options.repo.archiveVariant({
      tenantId: options.tenantId,
      variantId: options.variantId,
      expectedVersion: options.expectedVersion ?? null
    })
  );
  return { data, meta: {} };
}
