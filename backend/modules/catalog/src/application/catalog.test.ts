import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  archiveCategory,
  archiveProduct,
  archiveVariant,
  createCategory,
  createProduct,
  createVariant,
  getProduct,
  listCategories,
  listProducts,
  listVariants,
  updateCategory,
  updateProduct,
  updateVariant
} from "./catalog.js";
import { InMemoryCatalogRepository } from "../infrastructure/persistence/in-memory-catalog.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1b");
const tenantB = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c2b");

const writePerms = ["catalog.read", "catalog.write"];
const readOnlyPerms = ["catalog.read"];

function seed() {
  return new InMemoryCatalogRepository();
}

describe("BE-CAT-002 categories", () => {
  it("happy path: create + list categories", async () => {
    const repo = seed();
    const created = await createCategory({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-cat-1",
      name: "Beverages"
    });
    expect(created.data.name).toBe("Beverages");
    expect(created.data.status).toBe("active");
    expect(created.data.version).toBe(1);

    const listed = await listCategories({ repo, tenantId: tenantA, actorPermissions: readOnlyPerms });
    expect(listed.data.some((c) => c.id === created.data.id)).toBe(true);
    expect(listed.page_info).toEqual({ next_cursor: null, has_more: false });
  });

  it("catalog.write permission enforced on createCategory", async () => {
    const repo = seed();
    await expect(
      createCategory({
        repo,
        tenantId: tenantA,
        actorPermissions: readOnlyPerms,
        idempotencyKey: "idem-cat-deny",
        name: "Denied"
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });

  it("Idempotency-Key missing on createCategory -> IDEMPOTENCY_KEY_REQUIRED", async () => {
    const repo = seed();
    await expect(
      createCategory({ repo, tenantId: tenantA, actorPermissions: writePerms, name: "No Key" })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
  });

  it("replaying the same Idempotency-Key returns the same category", async () => {
    const repo = seed();
    const first = await createCategory({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-cat-replay",
      name: "Snacks"
    });
    const second = await createCategory({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-cat-replay",
      name: "Ignored On Replay"
    });
    expect(second.data.id).toBe(first.data.id);
    expect(second.data.name).toBe("Snacks");
  });

  it("category parent cycle detection on update -> CATEGORY_CYCLE", async () => {
    const repo = seed();
    const parent = await createCategory({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-a",
      name: "A"
    });
    const child = await createCategory({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-b",
      name: "B",
      parentId: parent.data.id
    });

    await expect(
      updateCategory({
        repo,
        tenantId: tenantA,
        actorPermissions: writePerms,
        categoryId: parent.data.id,
        expectedVersion: parent.data.version,
        parentId: child.data.id
      })
    ).rejects.toMatchObject({ code: "CATEGORY_CYCLE" });
  });

  it("archive sets status=archived and bumps version; re-archiving -> RESOURCE_NOT_FOUND", async () => {
    const repo = seed();
    const created = await createCategory({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-cat-arch",
      name: "Seasonal"
    });
    const archived = await archiveCategory({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-cat-arch-op",
      categoryId: created.data.id
    });
    expect(archived.data.status).toBe("archived");
    expect(archived.data.version).toBe(2);

    await expect(
      archiveCategory({
        repo,
        tenantId: tenantA,
        actorPermissions: writePerms,
        idempotencyKey: "idem-cat-arch-op-2",
        categoryId: created.data.id
      })
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});

describe("BE-CAT-002 products", () => {
  it("happy path: create product, get by id carries version for ETag", async () => {
    const repo = seed();
    const category = await createCategory({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-cat",
      name: "Drinks"
    });
    const created = await createProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-prod-1",
      name: "Cola",
      categoryId: category.data.id
    });
    expect(created.data.status).toBe("draft");
    expect(created.data.category_id).toBe(category.data.id);

    const fetched = await getProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: readOnlyPerms,
      productId: created.data.id
    });
    expect(fetched.data.version).toBe(1);
  });

  it("cross-tenant isolation: product from tenant A is not visible to tenant B", async () => {
    const repo = seed();
    const created = await createProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-prod-iso",
      name: "Tenant A Product"
    });

    await expect(
      getProduct({ repo, tenantId: tenantB, actorPermissions: readOnlyPerms, productId: created.data.id })
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });

    const listedForB = await listProducts({ repo, tenantId: tenantB, actorPermissions: readOnlyPerms });
    expect(listedForB.data.some((p) => p.id === created.data.id)).toBe(false);
  });

  it("stale expected_version on updateProduct -> RESOURCE_VERSION_MISMATCH", async () => {
    const repo = seed();
    const created = await createProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-prod-ver",
      name: "Juice"
    });
    await updateProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      productId: created.data.id,
      expectedVersion: created.data.version,
      name: "Juice v2"
    });

    await expect(
      updateProduct({
        repo,
        tenantId: tenantA,
        actorPermissions: writePerms,
        productId: created.data.id,
        expectedVersion: created.data.version, // stale — already bumped to 2
        name: "Juice v3"
      })
    ).rejects.toMatchObject({ code: "RESOURCE_VERSION_MISMATCH" });
  });

  it("archived product blocks further mutation -> PRODUCT_ARCHIVED", async () => {
    const repo = seed();
    const created = await createProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-prod-arch",
      name: "Discontinued"
    });
    const archived = await archiveProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-prod-arch-op",
      productId: created.data.id
    });
    expect(archived.data.status).toBe("archived");
    expect(archived.data.version).toBe(2);

    await expect(
      updateProduct({
        repo,
        tenantId: tenantA,
        actorPermissions: writePerms,
        productId: created.data.id,
        expectedVersion: archived.data.version,
        name: "Should not apply"
      })
    ).rejects.toMatchObject({ code: "PRODUCT_ARCHIVED" });

    await expect(
      createVariant({
        repo,
        tenantId: tenantA,
        actorPermissions: writePerms,
        idempotencyKey: "idem-var-on-archived",
        productId: created.data.id,
        sku: "SKU-ON-ARCHIVED"
      })
    ).rejects.toMatchObject({ code: "PRODUCT_ARCHIVED" });
  });
});

describe("BE-CAT-002 variants", () => {
  it("happy path: create variant maps sku onto name", async () => {
    const repo = seed();
    const product = await createProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-prod-for-variant",
      name: "T-Shirt"
    });
    const variant = await createVariant({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-var-1",
      productId: product.data.id,
      sku: "TSHIRT-RED-M",
      unitPriceMinor: 150000
    });
    expect(variant.data.name).toBe("TSHIRT-RED-M");
    expect(variant.data.status).toBe("active");
    expect(variant.data.version).toBe(1);

    const listed = await listVariants({ repo, tenantId: tenantA, actorPermissions: readOnlyPerms });
    expect(listed.data.some((v) => v.id === variant.data.id)).toBe(true);
  });

  it("duplicate SKU within tenant -> SKU_DUPLICATE", async () => {
    const repo = seed();
    const product = await createProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-prod-sku",
      name: "Mug"
    });
    await createVariant({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-var-sku-1",
      productId: product.data.id,
      sku: "MUG-001"
    });

    await expect(
      createVariant({
        repo,
        tenantId: tenantA,
        actorPermissions: writePerms,
        idempotencyKey: "idem-var-sku-2",
        productId: product.data.id,
        sku: "MUG-001"
      })
    ).rejects.toMatchObject({ code: "SKU_DUPLICATE" });
  });

  it("negative unit_price_minor is rejected -> VALIDATION_FAILED", async () => {
    const repo = seed();
    const product = await createProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-prod-money",
      name: "Bad Price"
    });
    await expect(
      createVariant({
        repo,
        tenantId: tenantA,
        actorPermissions: writePerms,
        idempotencyKey: "idem-var-negative",
        productId: product.data.id,
        sku: "NEG-1",
        unitPriceMinor: -1
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("catalog.read permission enforced on listVariants", async () => {
    const repo = seed();
    await expect(
      listVariants({ repo, tenantId: tenantA, actorPermissions: [] })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });

  it("updateVariant then archiveVariant frees the SKU for reuse", async () => {
    const repo = seed();
    const product = await createProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-prod-var-lifecycle",
      name: "Cap"
    });
    const variant = await createVariant({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-var-lifecycle",
      productId: product.data.id,
      sku: "CAP-001",
      unitPriceMinor: 50000
    });

    const updated = await updateVariant({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      variantId: variant.data.id,
      expectedVersion: variant.data.version,
      unitPriceMinor: 60000
    });
    expect(updated.data.version).toBe(2);

    const archived = await archiveVariant({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-var-lifecycle-archive",
      variantId: variant.data.id,
      expectedVersion: updated.data.version
    });
    expect(archived.data.status).toBe("archived");

    // SKU freed by archiving — a new variant can reuse it.
    const reused = await createVariant({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "idem-var-reuse-sku",
      productId: product.data.id,
      sku: "CAP-001"
    });
    expect(reused.data.status).toBe("active");
  });
});
