import { DomainInvariantError, generateUuidV7, Money, type UuidV7 } from "@ai-sales/domain-kernel";
import { applyFieldPolicies } from "@ai-sales/security";

/**
 * BE-CAT-002 — Product/category/variant CRUD + ETag.
 * BE-CAT-003 — Cost/price permission + price_history ledger + audit.
 * Mirrors BE-IDN-010 style (modules/tenant: members.ts + members-roles.controller.ts + in-memory repo).
 *
 * Note: frozen OpenAPI `CatalogResource` does not include `unit_price_minor` / `cost_minor`.
 * Pricing is exposed via `getVariantPricing` / `listVariantPriceHistory` (field-policy gated).
 * Cost writes use `setVariantCost` until a future contract adds cost on request bodies.
 */

export type CatalogStatus = "draft" | "active" | "archived";
export type CatalogPermission =
  | "catalog.read"
  | "catalog.write"
  | "catalog.cost.read"
  | "catalog.cost.write";

export type CatalogErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "COST_PERMISSION_REQUIRED"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_VERSION_MISMATCH"
  | "SKU_DUPLICATE"
  | "BARCODE_DUPLICATE"
  | "CATEGORY_CYCLE"
  | "PRODUCT_ARCHIVED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "REQUEST_TOO_LARGE";

export interface PriceHistoryRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly variantId: string;
  readonly oldPriceMinor: number | null;
  readonly newPriceMinor: number | null;
  readonly oldCostMinor: number | null;
  readonly newCostMinor: number | null;
  readonly reason: string | null;
  readonly source: string | null;
  readonly actorId: string;
  readonly effectiveAt: string;
}

export interface CatalogAuditRecord {
  readonly action: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly variantId: string;
  readonly detail: Record<string, unknown>;
  readonly at: string;
}

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
    readonly costMinor: number | null | undefined;
    readonly status: "active" | "archived" | null | undefined;
    readonly actorId: string;
    readonly reason: string | null;
    readonly source: string;
  }): Promise<CatalogResource>;
  archiveVariant(args: {
    readonly tenantId: string;
    readonly variantId: string;
    readonly expectedVersion: number | null;
  }): Promise<CatalogResource>;
  getVariantPricing(args: {
    readonly tenantId: string;
    readonly variantId: string;
  }): Promise<{
    readonly id: string;
    readonly tenant_id: string;
    readonly unit_price_minor: number;
    readonly currency: string;
    readonly cost_minor: number | null;
    readonly version: number;
  } | null>;
  listPriceHistory(args: {
    readonly tenantId: string;
    readonly variantId: string;
  }): Promise<readonly PriceHistoryRecord[]>;
  recordInitialPriceHistory(args: {
    readonly tenantId: string;
    readonly variantId: string;
    readonly newPriceMinor: number;
    readonly newCostMinor: number | null;
    readonly actorId: string;
    readonly source: string;
  }): Promise<void>;

  // Idempotency (create*/archive* per OpenAPI x-idempotency: required) — simple
  // tenant+key -> last resource map; a Postgres adapter can later back this with
  // @ai-sales/idempotency's request-hash store.
  getIdempotentResult(tenantId: string, key: string): Promise<CatalogResource | null>;
  saveIdempotentResult(tenantId: string, key: string, resource: CatalogResource): Promise<void>;
}

function requireCostWrite(actorPermissions: readonly string[]): void {
  if (!actorPermissions.includes("catalog.cost.write")) {
    throw new CatalogError("catalog.cost.write required to change cost.", "COST_PERMISSION_REQUIRED");
  }
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
  readonly actorId?: string;
  readonly idempotencyKey?: string | null;
  readonly productId: string;
  readonly sku: string;
  readonly unitPriceMinor?: number | null;
  readonly currency?: string | null;
  /** Application-level cost (not on frozen CreateVariantRequest); requires catalog.cost.write. */
  readonly costMinor?: number | null;
  readonly barcode?: string | null;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  if (options.costMinor != null) {
    requireCostWrite(options.actorPermissions);
    if (options.costMinor < 0) {
      throw new CatalogError("cost_minor must not be negative.", "VALIDATION_FAILED");
    }
  }
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const sku = options.sku?.trim() ?? "";
    if (!sku || sku.length > 100) {
      throw new CatalogError("Invalid sku.", "VALIDATION_FAILED");
    }
    const unitPriceMinor = options.unitPriceMinor ?? 0;
    const currency = (options.currency ?? "VND").trim().toUpperCase();
    validateMoney(unitPriceMinor, currency);
    const barcode = options.barcode?.trim() ? options.barcode.trim() : null;
    const variantId = generateUuidV7();
    const created = await options.repo.createVariant({
      tenantId: options.tenantId,
      productId: options.productId,
      variantId,
      sku,
      unitPriceMinor,
      currency,
      costMinor: options.costMinor ?? null,
      barcode
    });
    if (options.actorId) {
      await options.repo.recordInitialPriceHistory({
        tenantId: options.tenantId,
        variantId: created.id,
        newPriceMinor: unitPriceMinor,
        newCostMinor: options.costMinor ?? null,
        actorId: options.actorId,
        source: "create_variant"
      });
    }
    return created;
  });
  return { data, meta: {} };
}

export async function updateVariant(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly actorId: string;
  readonly variantId: string;
  readonly expectedVersion: number;
  readonly unitPriceMinor?: number | null;
  readonly status?: "active" | "archived" | null;
  readonly reason?: string | null;
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
    costMinor: undefined,
    status: options.status,
    actorId: options.actorId,
    reason: options.reason ?? null,
    source: "update_variant"
  });
  return { data, meta: {} };
}

/** BE-CAT-003 — change cost_minor (tax-exclusive input stored as minor units; HO prices are tax-inclusive). */
export async function setVariantCost(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly actorId: string;
  readonly variantId: string;
  readonly expectedVersion: number;
  readonly costMinor: number;
  readonly reason?: string | null;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  requireCostWrite(options.actorPermissions);
  if (!Number.isInteger(options.costMinor) || options.costMinor < 0) {
    throw new CatalogError("cost_minor must be a non-negative integer.", "VALIDATION_FAILED");
  }
  const data = await options.repo.updateVariant({
    tenantId: options.tenantId,
    variantId: options.variantId,
    expectedVersion: options.expectedVersion,
    unitPriceMinor: undefined,
    costMinor: options.costMinor,
    status: undefined,
    actorId: options.actorId,
    reason: options.reason ?? null,
    source: "set_variant_cost"
  });
  return { data, meta: {} };
}

/** BE-CAT-003 — pricing view with cost omitted unless catalog.cost.read. */
export async function getVariantPricing(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly variantId: string;
}): Promise<{
  readonly data: Record<string, unknown>;
  readonly meta: Record<string, never>;
}> {
  requireCatalogPermission(options.actorPermissions, "catalog.read");
  const row = await options.repo.getVariantPricing({
    tenantId: options.tenantId,
    variantId: options.variantId
  });
  if (!row) {
    throw new CatalogError("Variant not found.", "RESOURCE_NOT_FOUND");
  }
  const raw: Record<string, unknown> = {
    id: row.id,
    tenant_id: row.tenant_id,
    unit_price_minor: row.unit_price_minor,
    currency: row.currency,
    cost_minor: row.cost_minor,
    version: row.version,
    prices_tax_inclusive: true
  };
  return {
    data: applyFieldPolicies(raw, options.actorPermissions) as Record<string, unknown>,
    meta: {}
  };
}

/** BE-CAT-003 — append-only price/cost history; cost columns omitted without catalog.cost.read. */
export async function listVariantPriceHistory(options: {
  readonly repo: CatalogRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly variantId: string;
}): Promise<{
  readonly data: Record<string, unknown>[];
  readonly meta: Record<string, never>;
}> {
  requireCatalogPermission(options.actorPermissions, "catalog.read");
  const pricing = await options.repo.getVariantPricing({
    tenantId: options.tenantId,
    variantId: options.variantId
  });
  if (!pricing) {
    throw new CatalogError("Variant not found.", "RESOURCE_NOT_FOUND");
  }
  const rows = await options.repo.listPriceHistory({
    tenantId: options.tenantId,
    variantId: options.variantId
  });
  const canReadCost = options.actorPermissions.includes("catalog.cost.read");
  const data = rows.map((r) => {
    const raw: Record<string, unknown> = {
      id: r.id,
      variant_id: r.variantId,
      old_price_minor: r.oldPriceMinor,
      new_price_minor: r.newPriceMinor,
      reason: r.reason,
      source: r.source,
      actor_id: r.actorId,
      effective_at: r.effectiveAt
    };
    if (canReadCost) {
      raw.old_cost_minor = r.oldCostMinor;
      raw.new_cost_minor = r.newCostMinor;
    }
    return raw;
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
