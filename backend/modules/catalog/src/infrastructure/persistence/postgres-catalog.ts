import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  CatalogError,
  type CatalogRepository,
  type CatalogResource,
  type CatalogStatus,
  type PriceHistoryRecord
} from "../../application/catalog.js";
import type {
  MediaRepository,
  MediaScanStatus,
  MediaUploadRecord,
  ProductMediaRecord
} from "../../application/media.js";

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

type CategoryRow = {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  status: CatalogStatus;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type ProductRow = {
  id: string;
  tenant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  status: CatalogStatus;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type VariantRow = {
  id: string;
  tenant_id: string;
  product_id: string;
  sku: string;
  price_minor: string;
  cost_minor: string;
  currency: string;
  barcode: string | null;
  status: "active" | "inactive" | "archived";
  version: number;
  created_at: Date;
  updated_at: Date;
};

function toCategoryResource(c: CategoryRow): CatalogResource {
  return {
    id: c.id,
    tenant_id: c.tenant_id,
    name: c.name,
    description: null,
    category_id: c.parent_id,
    brand: null,
    status: c.status,
    version: Number(c.version),
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString()
  };
}

function toProductResource(p: ProductRow): CatalogResource {
  return {
    id: p.id,
    tenant_id: p.tenant_id,
    name: p.name,
    description: p.description,
    category_id: p.category_id,
    brand: p.brand,
    status: p.status,
    version: Number(p.version),
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString()
  };
}

function toVariantResource(v: VariantRow): CatalogResource {
  return {
    id: v.id,
    tenant_id: v.tenant_id,
    name: v.sku,
    description: null,
    category_id: null,
    brand: null,
    status: v.status === "inactive" ? "archived" : v.status,
    version: Number(v.version),
    created_at: v.created_at.toISOString(),
    updated_at: v.updated_at.toISOString()
  };
}

/** v1 process-local stores for idempotency and media uploads — no DB tables yet. */
export class PostgresCatalogRepository implements CatalogRepository, MediaRepository {
  private readonly idempotency = new Map<string, CatalogResource>();
  private readonly mediaJobIdempotency = new Map<
    string,
    {
      job_id: string;
      status: "queued" | "running" | "completed" | "failed" | "cancelled";
      status_url: string | null;
    }
  >();
  private readonly mediaAttachIdempotency = new Map<string, CatalogResource>();
  private readonly uploads = new Map<string, MediaUploadRecord & { bytesReceived: boolean }>();

  constructor(private readonly db: AppDatabase) {}

  private idemKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  async getIdempotentResult(tenantId: string, key: string): Promise<CatalogResource | null> {
    return this.idempotency.get(this.idemKey(tenantId, key)) ?? null;
  }

  async saveIdempotentResult(tenantId: string, key: string, resource: CatalogResource): Promise<void> {
    this.idempotency.set(this.idemKey(tenantId, key), resource);
  }

  private async resolveCategoryPath(
    trx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    parentId: string | null,
    slug: string
  ): Promise<string> {
    if (!parentId) return `/${slug}`;
    const parent = await sql<{ path: string }>`
      select path from app.categories where id = ${parentId}::uuid and tenant_id = ${tenantId}::uuid
    `.execute(trx);
    const parentPath = parent.rows[0]?.path;
    if (!parentPath) {
      throw new CatalogError("Unknown parent_id.", "VALIDATION_FAILED");
    }
    return `${parentPath}/${slug}`;
  }

  private async hasCycle(
    trx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    categoryId: string,
    proposedParentId: string
  ): Promise<boolean> {
    let cursor: string | null = proposedParentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === categoryId || seen.has(cursor)) return true;
      seen.add(cursor);
      const parentResult = await sql<{ parent_id: string | null }>`
        select parent_id from app.categories
        where id = ${cursor}::uuid and tenant_id = ${tenantId}::uuid
      `.execute(trx);
      cursor = parentResult.rows[0]?.parent_id ?? null;
    }
    return false;
  }

  async createCategory(args: {
    readonly tenantId: string;
    readonly categoryId: UuidV7;
    readonly name: string;
    readonly parentId: string | null;
  }): Promise<CatalogResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      if (args.parentId) {
        const parent = await sql<{ status: string }>`
          select status from app.categories
          where id = ${args.parentId}::uuid and tenant_id = ${args.tenantId}::uuid
        `.execute(trx);
        if (!parent.rows[0] || parent.rows[0].status === "archived") {
          throw new CatalogError("Unknown parent_id.", "VALIDATION_FAILED");
        }
      }
      const slug = slugify(args.name);
      const path = await this.resolveCategoryPath(trx, args.tenantId, args.parentId, slug);
      const inserted = await sql<CategoryRow>`
        insert into app.categories (id, tenant_id, parent_id, name, slug, path, status)
        values (
          ${args.categoryId}::uuid,
          ${args.tenantId}::uuid,
          ${args.parentId}::uuid,
          ${args.name},
          ${slug},
          ${path},
          'active'
        )
        returning id, tenant_id, parent_id, name, status, version, created_at, updated_at
      `.execute(trx);
      return toCategoryResource(inserted.rows[0]!);
    });
  }

  async listCategories(tenantId: string): Promise<readonly CatalogResource[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const rows = await sql<CategoryRow>`
        select id, tenant_id, parent_id, name, status, version, created_at, updated_at
        from app.categories
        order by path
      `.execute(trx);
      return rows.rows.map(toCategoryResource);
    });
  }

  async updateCategory(args: {
    readonly tenantId: string;
    readonly categoryId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
    readonly parentId: string | null | undefined;
  }): Promise<CatalogResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await sql<CategoryRow & { slug: string; path: string }>`
        select id, tenant_id, parent_id, name, status, version, created_at, updated_at, slug, path
        from app.categories
        where id = ${args.categoryId}::uuid
      `.execute(trx);
      const category = current.rows[0];
      if (!category || category.status === "archived") {
        throw new CatalogError("Category not found.", "RESOURCE_NOT_FOUND");
      }
      if (Number(category.version) !== args.expectedVersion) {
        throw new CatalogError("Category version conflict.", "RESOURCE_VERSION_MISMATCH");
      }

      let parentId = category.parent_id;
      let name = category.name;
      let slug = category.slug;
      let path = category.path;

      if (args.parentId !== undefined) {
        if (args.parentId !== null) {
          const parent = await sql<{ status: string }>`
            select status from app.categories
            where id = ${args.parentId}::uuid and tenant_id = ${args.tenantId}::uuid
          `.execute(trx);
          if (!parent.rows[0] || parent.rows[0].status === "archived") {
            throw new CatalogError("Unknown parent_id.", "VALIDATION_FAILED");
          }
          if (await this.hasCycle(trx, args.tenantId, category.id, args.parentId)) {
            throw new CatalogError("Category parent cycle.", "CATEGORY_CYCLE");
          }
        }
        parentId = args.parentId;
        path = await this.resolveCategoryPath(trx, args.tenantId, parentId, slug);
      }
      if (args.name != null) {
        name = args.name.trim();
        slug = slugify(name);
        path = await this.resolveCategoryPath(trx, args.tenantId, parentId, slug);
      }

      const oldPathRow = await sql<{ path: string }>`
        select path from app.categories
        where id = ${args.categoryId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      const oldPath = oldPathRow.rows[0]?.path;

      const updated = await sql<CategoryRow>`
        update app.categories
        set name = ${name},
            parent_id = ${parentId}::uuid,
            slug = ${slug},
            path = ${path},
            version = version + 1,
            updated_at = now()
        where id = ${args.categoryId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and version = ${args.expectedVersion}
        returning id, tenant_id, parent_id, name, status, version, created_at, updated_at
      `.execute(trx);
      const row = updated.rows[0];
      if (!row) {
        throw new CatalogError("Category version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      // Keep descendant materialized paths consistent after rename/reparent.
      if (oldPath && oldPath !== path) {
        await sql`
          update app.categories
          set path = ${path} || substring(path from ${oldPath.length + 1}),
              updated_at = now()
          where tenant_id = ${args.tenantId}::uuid
            and path like ${`${oldPath}/%`}
        `.execute(trx);
      }
      return toCategoryResource(row);
    });
  }

  async archiveCategory(args: {
    readonly tenantId: string;
    readonly categoryId: string;
    readonly expectedVersion: number | null;
  }): Promise<CatalogResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await sql<CategoryRow>`
        select id, tenant_id, parent_id, name, status, version, created_at, updated_at
        from app.categories where id = ${args.categoryId}::uuid
      `.execute(trx);
      const category = current.rows[0];
      if (!category) {
        throw new CatalogError("Category not found.", "RESOURCE_NOT_FOUND");
      }
      if (category.status === "archived") {
        throw new CatalogError("Category already archived.", "RESOURCE_NOT_FOUND");
      }
      if (args.expectedVersion !== null && Number(category.version) !== args.expectedVersion) {
        throw new CatalogError("Category version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      const updated = await sql<CategoryRow>`
        update app.categories
        set status = 'archived', version = version + 1, updated_at = now()
        where id = ${args.categoryId}::uuid and tenant_id = ${args.tenantId}::uuid
        returning id, tenant_id, parent_id, name, status, version, created_at, updated_at
      `.execute(trx);
      return toCategoryResource(updated.rows[0]!);
    });
  }

  async createProduct(args: {
    readonly tenantId: string;
    readonly productId: UuidV7;
    readonly name: string;
    readonly description: string | null;
    readonly categoryId: string | null;
    readonly brand: string | null;
    readonly status: "draft" | "active";
  }): Promise<CatalogResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      if (args.categoryId) {
        const category = await sql<{ status: string }>`
          select status from app.categories
          where id = ${args.categoryId}::uuid and tenant_id = ${args.tenantId}::uuid
        `.execute(trx);
        if (!category.rows[0] || category.rows[0].status === "archived") {
          throw new CatalogError("Unknown category_id.", "VALIDATION_FAILED");
        }
      }
      const inserted = await sql<ProductRow>`
        insert into app.products (
          id, tenant_id, category_id, name, description, brand, status
        ) values (
          ${args.productId}::uuid,
          ${args.tenantId}::uuid,
          ${args.categoryId}::uuid,
          ${args.name},
          ${args.description},
          ${args.brand},
          ${args.status}
        )
        returning id, tenant_id, category_id, name, description, brand, status,
                  version, created_at, updated_at
      `.execute(trx);
      return toProductResource(inserted.rows[0]!);
    });
  }

  async listProducts(tenantId: string): Promise<readonly CatalogResource[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const rows = await sql<ProductRow>`
        select id, tenant_id, category_id, name, description, brand, status,
               version, created_at, updated_at
        from app.products
        order by created_at desc
      `.execute(trx);
      return rows.rows.map(toProductResource);
    });
  }

  async getProduct(args: {
    readonly tenantId: string;
    readonly productId: string;
  }): Promise<CatalogResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<ProductRow>`
        select id, tenant_id, category_id, name, description, brand, status,
               version, created_at, updated_at
        from app.products where id = ${args.productId}::uuid
      `.execute(trx);
      const product = result.rows[0];
      if (!product) {
        throw new CatalogError("Product not found.", "RESOURCE_NOT_FOUND");
      }
      return toProductResource(product);
    });
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
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await sql<ProductRow>`
        select id, tenant_id, category_id, name, description, brand, status,
               version, created_at, updated_at
        from app.products where id = ${args.productId}::uuid
      `.execute(trx);
      const product = current.rows[0];
      if (!product) {
        throw new CatalogError("Product not found.", "RESOURCE_NOT_FOUND");
      }
      if (product.status === "archived") {
        throw new CatalogError("Product is archived.", "PRODUCT_ARCHIVED");
      }
      if (Number(product.version) !== args.expectedVersion) {
        throw new CatalogError("Product version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      if (args.categoryId !== undefined && args.categoryId !== null) {
        const category = await sql<{ status: string }>`
          select status from app.categories
          where id = ${args.categoryId}::uuid and tenant_id = ${args.tenantId}::uuid
        `.execute(trx);
        if (!category.rows[0] || category.rows[0].status === "archived") {
          throw new CatalogError("Unknown category_id.", "VALIDATION_FAILED");
        }
      }

      // Explicit null clears nullable fields; undefined means "leave unchanged".
      const nextName = args.name !== undefined ? (args.name?.trim() ?? product.name) : product.name;
      const nextDescription =
        args.description !== undefined ? args.description : product.description;
      const nextCategoryId =
        args.categoryId !== undefined ? args.categoryId : product.category_id;
      const nextBrand = args.brand !== undefined ? args.brand : product.brand;
      const nextStatus = args.status !== undefined && args.status != null ? args.status : product.status;

      const updated = await sql<ProductRow>`
        update app.products
        set name = ${nextName},
            description = ${nextDescription},
            category_id = ${nextCategoryId}::uuid,
            brand = ${nextBrand},
            status = ${nextStatus},
            version = version + 1,
            updated_at = now()
        where id = ${args.productId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and version = ${args.expectedVersion}
        returning id, tenant_id, category_id, name, description, brand, status,
                  version, created_at, updated_at
      `.execute(trx);
      const row = updated.rows[0];
      if (!row) {
        throw new CatalogError("Product version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      return toProductResource(row);
    });
  }

  async archiveProduct(args: {
    readonly tenantId: string;
    readonly productId: string;
    readonly expectedVersion: number | null;
  }): Promise<CatalogResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await sql<ProductRow>`
        select id, tenant_id, category_id, name, description, brand, status,
               version, created_at, updated_at
        from app.products where id = ${args.productId}::uuid
      `.execute(trx);
      const product = current.rows[0];
      if (!product) {
        throw new CatalogError("Product not found.", "RESOURCE_NOT_FOUND");
      }
      if (product.status === "archived") {
        throw new CatalogError("Product is already archived.", "PRODUCT_ARCHIVED");
      }
      if (args.expectedVersion !== null && Number(product.version) !== args.expectedVersion) {
        throw new CatalogError("Product version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      const updated = await sql<ProductRow>`
        update app.products
        set status = 'archived', version = version + 1, updated_at = now()
        where id = ${args.productId}::uuid and tenant_id = ${args.tenantId}::uuid
        returning id, tenant_id, category_id, name, description, brand, status,
                  version, created_at, updated_at
      `.execute(trx);
      return toProductResource(updated.rows[0]!);
    });
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
    const ctx = adapterSecurityContext(args.tenantId);
    const sku = args.sku.toUpperCase().trim();
  try {
    return await withTenantTransaction(this.db, ctx, async (trx) => {
      const product = await sql<{ status: string }>`
        select status from app.products
        where id = ${args.productId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      if (!product.rows[0]) {
        throw new CatalogError("Product not found.", "RESOURCE_NOT_FOUND");
      }
      if (product.rows[0].status === "archived") {
        throw new CatalogError("Product is archived.", "PRODUCT_ARCHIVED");
      }
      const inserted = await sql<VariantRow>`
        insert into app.product_variants (
          id, tenant_id, product_id, sku, name, price_minor, cost_minor, currency, barcode, status
        ) values (
          ${args.variantId}::uuid,
          ${args.tenantId}::uuid,
          ${args.productId}::uuid,
          ${sku},
          ${sku},
          ${args.unitPriceMinor},
          ${args.costMinor ?? 0},
          ${args.currency},
          ${args.barcode},
          'active'
        )
        returning id, tenant_id, product_id, sku, price_minor, cost_minor, currency,
                  barcode, status, version, created_at, updated_at
      `.execute(trx);
      return toVariantResource(inserted.rows[0]!);
    });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code: string }).code)
        : "";
    if (code === "23505") {
      const msg = String((error as { constraint?: string }).constraint ?? "");
      if (msg.includes("barcode")) {
        throw new CatalogError("Barcode already exists.", "BARCODE_DUPLICATE");
      }
      throw new CatalogError("SKU already exists.", "SKU_DUPLICATE");
    }
    throw error;
  }
  }

  async listVariants(tenantId: string): Promise<readonly CatalogResource[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const rows = await sql<VariantRow>`
        select id, tenant_id, product_id, sku, price_minor, cost_minor, currency,
               barcode, status, version, created_at, updated_at
        from app.product_variants
        order by created_at desc
      `.execute(trx);
      return rows.rows.map(toVariantResource);
    });
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
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{
        id: string;
        tenant_id: string;
        price_minor: string;
        cost_minor: string;
        currency: string;
        version: number;
      }>`
        select id, tenant_id, price_minor, cost_minor, currency, version
        from app.product_variants where id = ${args.variantId}::uuid
      `.execute(trx);
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        tenant_id: row.tenant_id,
        unit_price_minor: Number(row.price_minor),
        currency: row.currency,
        cost_minor: Number(row.cost_minor),
        version: Number(row.version)
      };
    });
  }

  async listPriceHistory(args: {
    readonly tenantId: string;
    readonly variantId: string;
  }): Promise<readonly PriceHistoryRecord[]> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const rows = await sql<{
        id: string;
        tenant_id: string;
        variant_id: string;
        old_price_minor: string | null;
        new_price_minor: string | null;
        old_cost_minor: string | null;
        new_cost_minor: string | null;
        reason: string | null;
        source: string | null;
        actor_id: string;
        effective_at: Date;
      }>`
        select id, tenant_id, variant_id, old_price_minor, new_price_minor,
               old_cost_minor, new_cost_minor, reason, source, actor_id, effective_at
        from app.price_history
        where variant_id = ${args.variantId}::uuid
        order by effective_at asc
      `.execute(trx);
      return rows.rows.map((h: {
        id: string;
        tenant_id: string;
        variant_id: string;
        old_price_minor: string | null;
        new_price_minor: string | null;
        old_cost_minor: string | null;
        new_cost_minor: string | null;
        reason: string | null;
        source: string | null;
        actor_id: string;
        effective_at: Date;
      }) => ({
        id: h.id,
        tenantId: h.tenant_id,
        variantId: h.variant_id,
        oldPriceMinor: h.old_price_minor != null ? Number(h.old_price_minor) : null,
        newPriceMinor: h.new_price_minor != null ? Number(h.new_price_minor) : null,
        oldCostMinor: h.old_cost_minor != null ? Number(h.old_cost_minor) : null,
        newCostMinor: h.new_cost_minor != null ? Number(h.new_cost_minor) : null,
        reason: h.reason,
        source: h.source,
        actorId: h.actor_id,
        effectiveAt: h.effective_at.toISOString()
      }));
    });
  }

  async recordInitialPriceHistory(args: {
    readonly tenantId: string;
    readonly variantId: string;
    readonly newPriceMinor: number;
    readonly newCostMinor: number | null;
    readonly actorId: string;
    readonly source: string;
  }): Promise<void> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        insert into app.price_history (
          id, tenant_id, variant_id, old_price_minor, new_price_minor,
          old_cost_minor, new_cost_minor, source, actor_id
        ) values (
          ${generateUuidV7()}::uuid,
          ${args.tenantId}::uuid,
          ${args.variantId}::uuid,
          null,
          ${args.newPriceMinor},
          null,
          ${args.newCostMinor ?? 0},
          ${args.source},
          ${args.actorId}::uuid
        )
      `.execute(trx);
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
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await sql<VariantRow>`
        select id, tenant_id, product_id, sku, price_minor, cost_minor, currency,
               barcode, status, version, created_at, updated_at
        from app.product_variants where id = ${args.variantId}::uuid
      `.execute(trx);
      const variant = current.rows[0];
      if (!variant || variant.status === "archived") {
        throw new CatalogError("Variant not found.", "RESOURCE_NOT_FOUND");
      }
      if (Number(variant.version) !== args.expectedVersion) {
        throw new CatalogError("Variant version conflict.", "RESOURCE_VERSION_MISMATCH");
      }

      const oldPrice = Number(variant.price_minor);
      const oldCost = Number(variant.cost_minor);
      let newPrice = oldPrice;
      let newCost = oldCost;
      let priceChanged = false;
      let costChanged = false;

      if (args.unitPriceMinor != null && args.unitPriceMinor !== oldPrice) {
        newPrice = args.unitPriceMinor;
        priceChanged = true;
      }
      if (args.costMinor !== undefined && args.costMinor !== oldCost) {
        newCost = args.costMinor ?? 0;
        costChanged = true;
      }
      const dbStatus =
        args.status === "archived" ? "archived" : args.status === "active" ? "active" : variant.status;

      const updated = await sql<VariantRow>`
        update app.product_variants
        set price_minor = ${newPrice},
            cost_minor = ${newCost},
            status = ${dbStatus},
            version = version + 1,
            updated_at = now()
        where id = ${args.variantId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and version = ${args.expectedVersion}
        returning id, tenant_id, product_id, sku, price_minor, cost_minor, currency,
                  barcode, status, version, created_at, updated_at
      `.execute(trx);
      const row = updated.rows[0];
      if (!row) {
        throw new CatalogError("Variant version conflict.", "RESOURCE_VERSION_MISMATCH");
      }

      if (priceChanged || costChanged) {
        await sql`
          insert into app.price_history (
            id, tenant_id, variant_id, old_price_minor, new_price_minor,
            old_cost_minor, new_cost_minor, reason, source, actor_id
          ) values (
            ${generateUuidV7()}::uuid,
            ${args.tenantId}::uuid,
            ${args.variantId}::uuid,
            ${priceChanged ? oldPrice : null},
            ${priceChanged ? newPrice : null},
            ${costChanged ? oldCost : null},
            ${costChanged ? newCost : null},
            ${args.reason},
            ${args.source},
            ${args.actorId}::uuid
          )
        `.execute(trx);
      }

      return toVariantResource(row);
    });
  }

  async archiveVariant(args: {
    readonly tenantId: string;
    readonly variantId: string;
    readonly expectedVersion: number | null;
  }): Promise<CatalogResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await sql<VariantRow>`
        select id, tenant_id, product_id, sku, price_minor, cost_minor, currency,
               barcode, status, version, created_at, updated_at
        from app.product_variants where id = ${args.variantId}::uuid
      `.execute(trx);
      const variant = current.rows[0];
      if (!variant || variant.status === "archived") {
        throw new CatalogError("Variant not found.", "RESOURCE_NOT_FOUND");
      }
      if (args.expectedVersion !== null && Number(variant.version) !== args.expectedVersion) {
        throw new CatalogError("Variant version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      const updated = await sql<VariantRow>`
        update app.product_variants
        set status = 'archived', version = version + 1, updated_at = now()
        where id = ${args.variantId}::uuid and tenant_id = ${args.tenantId}::uuid
        returning id, tenant_id, product_id, sku, price_minor, cost_minor, currency,
                  barcode, status, version, created_at, updated_at
      `.execute(trx);
      return toVariantResource(updated.rows[0]!);
    });
  }

  // -------------------------------------------------------------------------
  // Media (process-local upload intents; product_media persisted)
  // -------------------------------------------------------------------------

  async createUploadIntent(args: {
    readonly tenantId: string;
    readonly uploadId: UuidV7;
    readonly filename: string;
    readonly contentType: string;
    readonly byteSize: number;
    readonly objectKey: string;
    readonly uploadUrl: string;
    readonly expiresAt: string;
  }): Promise<MediaUploadRecord> {
    const record: MediaUploadRecord & { bytesReceived: boolean } = {
      id: args.uploadId,
      tenantId: args.tenantId,
      filename: args.filename,
      contentType: args.contentType,
      byteSize: args.byteSize,
      objectKey: args.objectKey,
      uploadUrl: args.uploadUrl,
      expiresAt: args.expiresAt,
      bytesReceived: false,
      createdAt: new Date().toISOString()
    };
    this.uploads.set(args.uploadId, record);
    return record;
  }

  async getUploadIntent(args: {
    readonly tenantId: string;
    readonly uploadId: string;
  }): Promise<MediaUploadRecord | null> {
    const row = this.uploads.get(args.uploadId);
    if (!row || row.tenantId !== args.tenantId) return null;
    return row;
  }

  async markUploadBytesReceived(args: {
    readonly tenantId: string;
    readonly uploadId: string;
  }): Promise<MediaUploadRecord> {
    const row = this.uploads.get(args.uploadId);
    if (!row || row.tenantId !== args.tenantId) {
      throw new CatalogError("Upload intent not found.", "RESOURCE_NOT_FOUND");
    }
    row.bytesReceived = true;
    return row;
  }

  async findFirstActiveVariantId(args: {
    readonly tenantId: string;
    readonly productId: string;
  }): Promise<string | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{ id: string }>`
        select id from app.product_variants
        where product_id = ${args.productId}::uuid and status = 'active'
        order by created_at asc
        limit 1
      `.execute(trx);
      return result.rows[0]?.id ?? null;
    });
  }

  async assertProductAttachable(args: {
    readonly tenantId: string;
    readonly productId: string;
  }): Promise<void> {
    const ctx = adapterSecurityContext(args.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      const product = await sql<{ status: string }>`
        select status from app.products
        where id = ${args.productId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      if (!product.rows[0]) {
        throw new CatalogError("Product not found.", "RESOURCE_NOT_FOUND");
      }
      if (product.rows[0].status === "archived") {
        throw new CatalogError("Product is archived.", "PRODUCT_ARCHIVED");
      }
    });
  }

  async attachMedia(args: {
    readonly tenantId: string;
    readonly mediaId: UuidV7;
    readonly productId: string;
    readonly variantId: string;
    readonly uploadId: string;
    readonly objectKey: string;
    readonly mediaType: string;
    readonly sizeBytes: number;
    readonly sortOrder: number;
    readonly altText: string | null;
    readonly filename: string;
    readonly scanStatus: MediaScanStatus;
    readonly checksum: string | null;
  }): Promise<ProductMediaRecord> {
    const ctx = adapterSecurityContext(args.tenantId);
    const now = new Date().toISOString();
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        insert into app.product_media (
          id, tenant_id, variant_id, object_key, media_type, checksum,
          size_bytes, sort_order, scan_status, metadata
        ) values (
          ${args.mediaId}::uuid,
          ${args.tenantId}::uuid,
          ${args.variantId}::uuid,
          ${args.objectKey},
          ${args.mediaType},
          ${args.checksum},
          ${args.sizeBytes},
          ${args.sortOrder},
          ${args.scanStatus},
          ${JSON.stringify({
            product_id: args.productId,
            upload_id: args.uploadId,
            alt_text: args.altText,
            filename: args.filename
          })}::jsonb
        )
      `.execute(trx);
    });
    return {
      id: args.mediaId,
      tenantId: args.tenantId,
      productId: args.productId,
      variantId: args.variantId,
      uploadId: args.uploadId,
      objectKey: args.objectKey,
      mediaType: args.mediaType,
      checksum: args.checksum,
      sizeBytes: args.sizeBytes,
      sortOrder: args.sortOrder,
      scanStatus: args.scanStatus,
      altText: args.altText,
      filename: args.filename,
      version: 1,
      createdAt: now,
      updatedAt: now
    };
  }

  async getIdempotentMediaJob(
    tenantId: string,
    key: string
  ): Promise<{
    readonly job_id: string;
    readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
    readonly status_url: string | null;
  } | null> {
    return this.mediaJobIdempotency.get(`${tenantId}:${key}`) ?? null;
  }

  async saveIdempotentMediaJob(
    tenantId: string,
    key: string,
    job: {
      readonly job_id: string;
      readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
      readonly status_url: string | null;
    }
  ): Promise<void> {
    this.mediaJobIdempotency.set(`${tenantId}:${key}`, job);
  }

  async getIdempotentMediaAttach(tenantId: string, key: string): Promise<CatalogResource | null> {
    return this.mediaAttachIdempotency.get(`${tenantId}:${key}`) ?? null;
  }

  async saveIdempotentMediaAttach(
    tenantId: string,
    key: string,
    resource: CatalogResource
  ): Promise<void> {
    this.mediaAttachIdempotency.set(`${tenantId}:${key}`, resource);
  }

  async signDownloadUrl(args: {
    readonly tenantId: string;
    readonly mediaId: string;
  }): Promise<string> {
    const ctx = adapterSecurityContext(args.tenantId);
    const media = await withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{
        id: string;
        scan_status: string;
        metadata: Record<string, unknown>;
      }>`
        select id, scan_status, metadata from app.product_media
        where id = ${args.mediaId}::uuid
      `.execute(trx);
      return result.rows[0] ?? null;
    });
    if (!media) {
      throw new CatalogError("Media not found.", "RESOURCE_NOT_FOUND");
    }
    if (media.scan_status !== "clean") {
      throw new CatalogError("Media is not available for download.", "VALIDATION_FAILED");
    }
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    return `postgres://download/${args.tenantId}/${media.id}?expires=${encodeURIComponent(expires)}`;
  }
}
