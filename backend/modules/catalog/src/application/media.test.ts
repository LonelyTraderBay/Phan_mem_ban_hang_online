import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { createProduct, createVariant } from "./catalog.js";
import {
  attachProductMedia,
  createMediaUploadIntent,
  getSignedMediaDownloadUrl
} from "./media.js";
import { InMemoryCatalogRepository } from "../infrastructure/persistence/in-memory-catalog.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1b");
const tenantB = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c2b");
const writePerms = ["catalog.read", "catalog.write"];

describe("BE-CAT-004 media upload/scan/signed URL", () => {
  it("creates upload intent with signed status_url and attaches to product variant", async () => {
    const repo = new InMemoryCatalogRepository();
    const product = await createProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "p-media",
      name: "With Media"
    });
    await createVariant({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "v-media",
      productId: product.data.id,
      sku: "MED-1"
    });

    const intent = await createMediaUploadIntent({
      mediaRepo: repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "up-1",
      filename: "hero.png",
      contentType: "image/png",
      byteSize: 2048
    });
    expect(intent.data.status).toBe("completed");
    expect(intent.data.status_url).toContain("memory://upload/");
    expect(intent.data.job_id).toBeTruthy();

    const attached = await attachProductMedia({
      mediaRepo: repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "att-1",
      productId: product.data.id,
      uploadId: intent.data.job_id,
      altText: "Hero",
      sortOrder: 1
    });
    expect(attached.data.name).toBe("hero.png");
    expect(attached.data.description).toBe("Hero");
    expect(attached.data.brand).toBe("image/png");
    expect(attached.data.status).toBe("active");

    const signed = await getSignedMediaDownloadUrl({
      mediaRepo: repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      mediaId: attached.data.id
    });
    expect(signed.url).toContain("memory://download/");
  });

  it("rejects unsupported content_type and oversized uploads", async () => {
    const repo = new InMemoryCatalogRepository();
    await expect(
      createMediaUploadIntent({
        mediaRepo: repo,
        tenantId: tenantA,
        actorPermissions: writePerms,
        idempotencyKey: "bad-mime",
        filename: "x.exe",
        contentType: "application/octet-stream",
        byteSize: 100
      })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });

    await expect(
      createMediaUploadIntent({
        mediaRepo: repo,
        tenantId: tenantA,
        actorPermissions: writePerms,
        idempotencyKey: "too-big",
        filename: "big.png",
        contentType: "image/png",
        byteSize: 11 * 1024 * 1024
      })
    ).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
  });

  it("denies without catalog.write and isolates tenants", async () => {
    const repo = new InMemoryCatalogRepository();
    await expect(
      createMediaUploadIntent({
        mediaRepo: repo,
        tenantId: tenantA,
        actorPermissions: ["catalog.read"],
        idempotencyKey: "deny",
        filename: "a.png",
        contentType: "image/png",
        byteSize: 10
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });

    const product = await createProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "p-iso",
      name: "A"
    });
    await createVariant({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "v-iso",
      productId: product.data.id,
      sku: "ISO-1"
    });
    const intent = await createMediaUploadIntent({
      mediaRepo: repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "up-iso",
      filename: "a.png",
      contentType: "image/png",
      byteSize: 10
    });
    await expect(
      attachProductMedia({
        mediaRepo: repo,
        tenantId: tenantB,
        actorPermissions: writePerms,
        idempotencyKey: "att-iso",
        productId: product.data.id,
        uploadId: intent.data.job_id
      })
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("requires Idempotency-Key and replays intent", async () => {
    const repo = new InMemoryCatalogRepository();
    await expect(
      createMediaUploadIntent({
        mediaRepo: repo,
        tenantId: tenantA,
        actorPermissions: writePerms,
        filename: "a.png",
        contentType: "image/png",
        byteSize: 10
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });

    const first = await createMediaUploadIntent({
      mediaRepo: repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "same-up",
      filename: "a.png",
      contentType: "image/png",
      byteSize: 10
    });
    const second = await createMediaUploadIntent({
      mediaRepo: repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "same-up",
      filename: "b.png",
      contentType: "image/jpeg",
      byteSize: 20
    });
    expect(second.data.job_id).toBe(first.data.job_id);
  });

  it("fails attach when product has no active variant", async () => {
    const repo = new InMemoryCatalogRepository();
    const product = await createProduct({
      repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "p-novar",
      name: "Empty"
    });
    const intent = await createMediaUploadIntent({
      mediaRepo: repo,
      tenantId: tenantA,
      actorPermissions: writePerms,
      idempotencyKey: "up-novar",
      filename: "a.png",
      contentType: "image/png",
      byteSize: 10
    });
    await expect(
      attachProductMedia({
        mediaRepo: repo,
        tenantId: tenantA,
        actorPermissions: writePerms,
        idempotencyKey: "att-novar",
        productId: product.data.id,
        uploadId: intent.data.job_id
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
