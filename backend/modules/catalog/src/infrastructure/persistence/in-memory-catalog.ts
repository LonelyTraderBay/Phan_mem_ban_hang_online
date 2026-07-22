import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  CatalogError,
  type CatalogAuditRecord,
  type CatalogRepository,
  type CatalogResource,
  type CatalogStatus,
  type PriceHistoryRecord
} from "../../application/catalog.js";

interface StoredCategory {
  id: string;
  tenantId: string;
  name: string;
  /** No dedicated parent_id slot on the frozen CatalogResource — reused via toCategoryResource. */
  parentId: string | null;
  status: CatalogStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredProduct {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  brand: string | null;
  status: CatalogStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredVariant {
  id: string;
  tenantId: string;
  /** Not exposed on CatalogResource (no product linkage field in the frozen contract). */
  productId: string;
  sku: string;
  unitPriceMinor: number;
  currency: string;
  /** Field-level protected — expose via getVariantPricing + catalog.cost.read. */
  costMinor: number | null;
  barcode: string | null;
  status: "active" | "archived";
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class InMemoryCatalogRepository implements CatalogRepository {
  readonly categories = new Map<string, StoredCategory>();
  readonly products = new Map<string, StoredProduct>();
  readonly variants = new Map<string, StoredVariant>();
  readonly priceHistory: PriceHistoryRecord[] = [];
  readonly audits: CatalogAuditRecord[] = [];
  private readonly idempotency = new Map<string, CatalogResource>();

  private toCategoryResource(c: StoredCategory): CatalogResource {
    return {
      id: c.id,
      tenant_id: c.tenantId,
      name: c.name,
      description: null,
      category_id: c.parentId,
      brand: null,
      status: c.status,
      version: c.version,
      created_at: c.createdAt.toISOString(),
      updated_at: c.updatedAt.toISOString()
    };
  }

  private toProductResource(p: StoredProduct): CatalogResource {
    return {
      id: p.id,
      tenant_id: p.tenantId,
      name: p.name,
      description: p.description,
      category_id: p.categoryId,
      brand: p.brand,
      status: p.status,
      version: p.version,
      created_at: p.createdAt.toISOString(),
      updated_at: p.updatedAt.toISOString()
    };
  }

  private toVariantResource(v: StoredVariant): CatalogResource {
    return {
      id: v.id,
      tenant_id: v.tenantId,
      name: v.sku,
      description: null,
      category_id: null,
      brand: null,
      status: v.status,
      version: v.version,
      created_at: v.createdAt.toISOString(),
      updated_at: v.updatedAt.toISOString()
    };
  }

  private idemKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  async getIdempotentResult(tenantId: string, key: string): Promise<CatalogResource | null> {
    return this.idempotency.get(this.idemKey(tenantId, key)) ?? null;
  }

  async saveIdempotentResult(tenantId: string, key: string, resource: CatalogResource): Promise<void> {
    this.idempotency.set(this.idemKey(tenantId, key), resource);
  }

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  /** Walks parentId's ancestor chain; true if categoryId would become its own ancestor. */
  private hasCycle(tenantId: string, categoryId: string, proposedParentId: string): boolean {
    let cursor: string | null = proposedParentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === categoryId || seen.has(cursor)) return true;
      seen.add(cursor);
      const parent = this.categories.get(cursor);
      if (!parent || parent.tenantId !== tenantId) break;
      cursor = parent.parentId;
    }
    return false;
  }

  async createCategory(args: {
    readonly tenantId: string;
    readonly categoryId: UuidV7;
    readonly name: string;
    readonly parentId: string | null;
  }): Promise<CatalogResource> {
    if (args.parentId) {
      const parent = this.categories.get(args.parentId);
      if (!parent || parent.tenantId !== args.tenantId || parent.status === "archived") {
        throw new CatalogError("Unknown parent_id.", "VALIDATION_FAILED");
      }
    }
    const now = new Date();
    const category: StoredCategory = {
      id: args.categoryId,
      tenantId: args.tenantId,
      name: args.name,
      parentId: args.parentId,
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now
    };
    this.categories.set(category.id, category);
    return this.toCategoryResource(category);
  }

  async listCategories(tenantId: string): Promise<readonly CatalogResource[]> {
    return [...this.categories.values()]
      .filter((c) => c.tenantId === tenantId)
      .map((c) => this.toCategoryResource(c));
  }

  async updateCategory(args: {
    readonly tenantId: string;
    readonly categoryId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
    readonly parentId: string | null | undefined;
  }): Promise<CatalogResource> {
    const category = this.categories.get(args.categoryId);
    if (!category || category.tenantId !== args.tenantId || category.status === "archived") {
      throw new CatalogError("Category not found.", "RESOURCE_NOT_FOUND");
    }
    if (category.version !== args.expectedVersion) {
      throw new CatalogError("Category version conflict.", "RESOURCE_VERSION_MISMATCH");
    }
    if (args.parentId !== undefined) {
      if (args.parentId !== null) {
        const parent = this.categories.get(args.parentId);
        if (!parent || parent.tenantId !== args.tenantId || parent.status === "archived") {
          throw new CatalogError("Unknown parent_id.", "VALIDATION_FAILED");
        }
        if (this.hasCycle(args.tenantId, category.id, args.parentId)) {
          throw new CatalogError("Category parent cycle.", "CATEGORY_CYCLE");
        }
      }
      category.parentId = args.parentId;
    }
    if (args.name != null) {
      category.name = args.name.trim();
    }
    category.version += 1;
    category.updatedAt = new Date();
    return this.toCategoryResource(category);
  }

  async archiveCategory(args: {
    readonly tenantId: string;
    readonly categoryId: string;
    readonly expectedVersion: number | null;
  }): Promise<CatalogResource> {
    const category = this.categories.get(args.categoryId);
    if (!category || category.tenantId !== args.tenantId) {
      throw new CatalogError("Category not found.", "RESOURCE_NOT_FOUND");
    }
    if (category.status === "archived") {
      throw new CatalogError("Category already archived.", "RESOURCE_NOT_FOUND");
    }
    if (args.expectedVersion !== null && category.version !== args.expectedVersion) {
      throw new CatalogError("Category version conflict.", "RESOURCE_VERSION_MISMATCH");
    }
    category.status = "archived";
    category.version += 1;
    category.updatedAt = new Date();
    return this.toCategoryResource(category);
  }

  // -------------------------------------------------------------------------
  // Products
  // -------------------------------------------------------------------------

  async createProduct(args: {
    readonly tenantId: string;
    readonly productId: UuidV7;
    readonly name: string;
    readonly description: string | null;
    readonly categoryId: string | null;
    readonly brand: string | null;
    readonly status: "draft" | "active";
  }): Promise<CatalogResource> {
    if (args.categoryId) {
      const category = this.categories.get(args.categoryId);
      if (!category || category.tenantId !== args.tenantId || category.status === "archived") {
        throw new CatalogError("Unknown category_id.", "VALIDATION_FAILED");
      }
    }
    const now = new Date();
    const product: StoredProduct = {
      id: args.productId,
      tenantId: args.tenantId,
      name: args.name,
      description: args.description,
      categoryId: args.categoryId,
      brand: args.brand,
      status: args.status,
      version: 1,
      createdAt: now,
      updatedAt: now
    };
    this.products.set(product.id, product);
    return this.toProductResource(product);
  }

  async listProducts(tenantId: string): Promise<readonly CatalogResource[]> {
    return [...this.products.values()]
      .filter((p) => p.tenantId === tenantId)
      .map((p) => this.toProductResource(p));
  }

  async getProduct(args: { readonly tenantId: string; readonly productId: string }): Promise<CatalogResource> {
    const product = this.products.get(args.productId);
    if (!product || product.tenantId !== args.tenantId) {
      throw new CatalogError("Product not found.", "RESOURCE_NOT_FOUND");
    }
    return this.toProductResource(product);
  }

  async updateProduct(args: {
    readonly tenantId: string;
    readonly productId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
    readonly description: string | null | undefined;
    readonly categoryId: string | null | undefined;
    readonly brand: string | null | undefined;
    readonly status: "draft" | "active" | null | undefined;
  }): Promise<CatalogResource> {
    const product = this.products.get(args.productId);
    if (!product || product.tenantId !== args.tenantId) {
      throw new CatalogError("Product not found.", "RESOURCE_NOT_FOUND");
    }
    if (product.status === "archived") {
      throw new CatalogError("Product is archived.", "PRODUCT_ARCHIVED");
    }
    if (product.version !== args.expectedVersion) {
      throw new CatalogError("Product version conflict.", "RESOURCE_VERSION_MISMATCH");
    }
    if (args.categoryId !== undefined) {
      if (args.categoryId !== null) {
        const category = this.categories.get(args.categoryId);
        if (!category || category.tenantId !== args.tenantId || category.status === "archived") {
          throw new CatalogError("Unknown category_id.", "VALIDATION_FAILED");
        }
      }
      product.categoryId = args.categoryId;
    }
    if (args.name != null) product.name = args.name.trim();
    if (args.description !== undefined) product.description = args.description;
    if (args.brand !== undefined) product.brand = args.brand;
    if (args.status != null) product.status = args.status;
    product.version += 1;
    product.updatedAt = new Date();
    return this.toProductResource(product);
  }

  async archiveProduct(args: {
    readonly tenantId: string;
    readonly productId: string;
    readonly expectedVersion: number | null;
  }): Promise<CatalogResource> {
    const product = this.products.get(args.productId);
    if (!product || product.tenantId !== args.tenantId) {
      throw new CatalogError("Product not found.", "RESOURCE_NOT_FOUND");
    }
    if (product.status === "archived") {
      throw new CatalogError("Product is already archived.", "PRODUCT_ARCHIVED");
    }
    if (args.expectedVersion !== null && product.version !== args.expectedVersion) {
      throw new CatalogError("Product version conflict.", "RESOURCE_VERSION_MISMATCH");
    }
    product.status = "archived";
    product.version += 1;
    product.updatedAt = new Date();
    return this.toProductResource(product);
  }

  // -------------------------------------------------------------------------
  // Variants
  // -------------------------------------------------------------------------

  private skuTaken(tenantId: string, sku: string): boolean {
    for (const v of this.variants.values()) {
      if (v.tenantId === tenantId && v.status !== "archived" && v.sku === sku) return true;
    }
    return false;
  }

  private barcodeTaken(tenantId: string, barcode: string): boolean {
    for (const v of this.variants.values()) {
      if (v.tenantId === tenantId && v.status !== "archived" && v.barcode === barcode) return true;
    }
    return false;
  }

  async createVariant(args: {
    readonly tenantId: string;
    readonly productId: string;
    readonly variantId: UuidV7;
    readonly sku: string;
    readonly unitPriceMinor: number;
    readonly currency: string;
    readonly costMinor: number | null;
    readonly barcode: string | null;
  }): Promise<CatalogResource> {
    const product = this.products.get(args.productId);
    if (!product || product.tenantId !== args.tenantId) {
      throw new CatalogError("Product not found.", "RESOURCE_NOT_FOUND");
    }
    if (product.status === "archived") {
      throw new CatalogError("Product is archived.", "PRODUCT_ARCHIVED");
    }
    if (this.skuTaken(args.tenantId, args.sku)) {
      throw new CatalogError("SKU already exists.", "SKU_DUPLICATE");
    }
    if (args.barcode && this.barcodeTaken(args.tenantId, args.barcode)) {
      throw new CatalogError("Barcode already exists.", "BARCODE_DUPLICATE");
    }
    const now = new Date();
    const variant: StoredVariant = {
      id: args.variantId,
      tenantId: args.tenantId,
      productId: args.productId,
      sku: args.sku,
      unitPriceMinor: args.unitPriceMinor,
      currency: args.currency,
      costMinor: args.costMinor,
      barcode: args.barcode,
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now
    };
    this.variants.set(variant.id, variant);
    return this.toVariantResource(variant);
  }

  async listVariants(tenantId: string): Promise<readonly CatalogResource[]> {
    return [...this.variants.values()]
      .filter((v) => v.tenantId === tenantId)
      .map((v) => this.toVariantResource(v));
  }

  async getVariantPricing(args: {
    readonly tenantId: string;
    readonly variantId: string;
  }): Promise<{
    readonly id: string;
    readonly tenant_id: string;
    readonly unit_price_minor: number;
    readonly currency: string;
    readonly cost_minor: number | null;
    readonly version: number;
  } | null> {
    const variant = this.variants.get(args.variantId);
    if (!variant || variant.tenantId !== args.tenantId) return null;
    return {
      id: variant.id,
      tenant_id: variant.tenantId,
      unit_price_minor: variant.unitPriceMinor,
      currency: variant.currency,
      cost_minor: variant.costMinor,
      version: variant.version
    };
  }

  async listPriceHistory(args: {
    readonly tenantId: string;
    readonly variantId: string;
  }): Promise<readonly PriceHistoryRecord[]> {
    return this.priceHistory.filter(
      (h) => h.tenantId === args.tenantId && h.variantId === args.variantId
    );
  }

  async recordInitialPriceHistory(args: {
    readonly tenantId: string;
    readonly variantId: string;
    readonly newPriceMinor: number;
    readonly newCostMinor: number | null;
    readonly actorId: string;
    readonly source: string;
  }): Promise<void> {
    const at = new Date().toISOString();
    this.priceHistory.push({
      id: generateUuidV7(),
      tenantId: args.tenantId,
      variantId: args.variantId,
      oldPriceMinor: null,
      newPriceMinor: args.newPriceMinor,
      oldCostMinor: null,
      newCostMinor: args.newCostMinor,
      reason: null,
      source: args.source,
      actorId: args.actorId,
      effectiveAt: at
    });
    this.audits.push({
      action: "catalog.price_history.append",
      tenantId: args.tenantId,
      actorId: args.actorId,
      variantId: args.variantId,
      detail: { source: args.source, new_price_minor: args.newPriceMinor },
      at
    });
  }

  async updateVariant(args: {
    readonly tenantId: string;
    readonly variantId: string;
    readonly expectedVersion: number;
    readonly unitPriceMinor: number | null | undefined;
    readonly costMinor: number | null | undefined;
    readonly status: "active" | "archived" | null | undefined;
    readonly actorId: string;
    readonly reason: string | null;
    readonly source: string;
  }): Promise<CatalogResource> {
    const variant = this.variants.get(args.variantId);
    if (!variant || variant.tenantId !== args.tenantId || variant.status === "archived") {
      throw new CatalogError("Variant not found.", "RESOURCE_NOT_FOUND");
    }
    if (variant.version !== args.expectedVersion) {
      throw new CatalogError("Variant version conflict.", "RESOURCE_VERSION_MISMATCH");
    }

    const oldPrice = variant.unitPriceMinor;
    const oldCost = variant.costMinor;
    let priceChanged = false;
    let costChanged = false;

    if (args.unitPriceMinor != null && args.unitPriceMinor !== variant.unitPriceMinor) {
      variant.unitPriceMinor = args.unitPriceMinor;
      priceChanged = true;
    }
    if (args.costMinor !== undefined && args.costMinor !== variant.costMinor) {
      variant.costMinor = args.costMinor;
      costChanged = true;
    }
    if (args.status != null) variant.status = args.status;
    variant.version += 1;
    variant.updatedAt = new Date();

    if (priceChanged || costChanged) {
      const at = variant.updatedAt.toISOString();
      this.priceHistory.push({
        id: generateUuidV7(),
        tenantId: args.tenantId,
        variantId: variant.id,
        oldPriceMinor: priceChanged ? oldPrice : null,
        newPriceMinor: priceChanged ? variant.unitPriceMinor : null,
        oldCostMinor: costChanged ? oldCost : null,
        newCostMinor: costChanged ? variant.costMinor : null,
        reason: args.reason,
        source: args.source,
        actorId: args.actorId,
        effectiveAt: at
      });
      this.audits.push({
        action: costChanged ? "catalog.cost.update" : "catalog.price.update",
        tenantId: args.tenantId,
        actorId: args.actorId,
        variantId: variant.id,
        detail: {
          source: args.source,
          price_changed: priceChanged,
          cost_changed: costChanged,
          reason: args.reason
        },
        at
      });
    }

    return this.toVariantResource(variant);
  }

  async archiveVariant(args: {
    readonly tenantId: string;
    readonly variantId: string;
    readonly expectedVersion: number | null;
  }): Promise<CatalogResource> {
    const variant = this.variants.get(args.variantId);
    if (!variant || variant.tenantId !== args.tenantId || variant.status === "archived") {
      throw new CatalogError("Variant not found.", "RESOURCE_NOT_FOUND");
    }
    if (args.expectedVersion !== null && variant.version !== args.expectedVersion) {
      throw new CatalogError("Variant version conflict.", "RESOURCE_VERSION_MISMATCH");
    }
    variant.status = "archived";
    variant.version += 1;
    variant.updatedAt = new Date();
    return this.toVariantResource(variant);
  }
}
