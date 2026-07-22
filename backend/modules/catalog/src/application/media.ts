import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  CatalogError,
  requireCatalogPermission,
  type CatalogRepository,
  type CatalogResource
} from "./catalog.js";

/**
 * BE-CAT-004 — Private media upload intent / attach / scan / signed URL (in-memory).
 * OpenAPI returns JobResponse for intent (status_url = upload URL) and CatalogResource for attach
 * (field reuse: name=filename, description=alt_text, brand=media_type, category_id=variant_id).
 */

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

/** Blueprint §12.6 — keep uploads small; 10 MiB v1 soft cap. */
const MAX_BYTE_SIZE = 10 * 1024 * 1024;

/** Upload URL TTL 15 minutes (blueprint 5–15 min). */
const UPLOAD_TTL_MS = 15 * 60 * 1000;

export type MediaScanStatus = "pending" | "clean" | "quarantined";

export type MediaUploadRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly objectKey: string;
  readonly uploadUrl: string;
  readonly expiresAt: string;
  readonly bytesReceived: boolean;
  readonly createdAt: string;
};

export type ProductMediaRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly productId: string;
  readonly variantId: string;
  readonly uploadId: string;
  readonly objectKey: string;
  readonly mediaType: string;
  readonly checksum: string | null;
  readonly sizeBytes: number;
  readonly sortOrder: number;
  readonly scanStatus: MediaScanStatus;
  readonly altText: string | null;
  readonly filename: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export interface MediaRepository {
  createUploadIntent(args: {
    readonly tenantId: string;
    readonly uploadId: UuidV7;
    readonly filename: string;
    readonly contentType: string;
    readonly byteSize: number;
    readonly objectKey: string;
    readonly uploadUrl: string;
    readonly expiresAt: string;
  }): Promise<MediaUploadRecord>;
  getUploadIntent(args: {
    readonly tenantId: string;
    readonly uploadId: string;
  }): Promise<MediaUploadRecord | null>;
  markUploadBytesReceived(args: {
    readonly tenantId: string;
    readonly uploadId: string;
  }): Promise<MediaUploadRecord>;
  findFirstActiveVariantId(args: {
    readonly tenantId: string;
    readonly productId: string;
  }): Promise<string | null>;
  assertProductAttachable(args: {
    readonly tenantId: string;
    readonly productId: string;
  }): Promise<void>;
  attachMedia(args: {
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
  }): Promise<ProductMediaRecord>;
  getIdempotentMediaJob(tenantId: string, key: string): Promise<{
    readonly job_id: string;
    readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
    readonly status_url: string | null;
  } | null>;
  saveIdempotentMediaJob(
    tenantId: string,
    key: string,
    job: {
      readonly job_id: string;
      readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
      readonly status_url: string | null;
    }
  ): Promise<void>;
  getIdempotentMediaAttach(tenantId: string, key: string): Promise<CatalogResource | null>;
  saveIdempotentMediaAttach(tenantId: string, key: string, resource: CatalogResource): Promise<void>;
  /** Signed download only when scan_status=clean. */
  signDownloadUrl(args: {
    readonly tenantId: string;
    readonly mediaId: string;
  }): Promise<string>;
}

function toMediaCatalogResource(media: ProductMediaRecord): CatalogResource {
  return {
    id: media.id,
    tenant_id: media.tenantId,
    name: media.filename,
    description: media.altText,
    category_id: media.variantId,
    brand: media.mediaType,
    status: media.scanStatus === "clean" ? "active" : "draft",
    version: media.version,
    created_at: media.createdAt,
    updated_at: media.updatedAt
  };
}

function validateUploadRequest(options: {
  readonly filename: string;
  readonly contentType: string;
  readonly byteSize: number;
}): { filename: string; contentType: string; byteSize: number } {
  const filename = options.filename?.trim() ?? "";
  if (!filename || filename.length > 255) {
    throw new CatalogError("Invalid filename.", "VALIDATION_FAILED");
  }
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    throw new CatalogError("filename must not contain path segments.", "VALIDATION_FAILED");
  }
  const contentType = (options.contentType?.trim() ?? "").toLowerCase();
  if (!contentType || contentType.length > 100) {
    throw new CatalogError("Invalid content_type.", "VALIDATION_FAILED");
  }
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new CatalogError("Unsupported media content_type.", "UNSUPPORTED_MEDIA_TYPE");
  }
  if (!Number.isInteger(options.byteSize) || options.byteSize < 1) {
    throw new CatalogError("byte_size must be a positive integer.", "VALIDATION_FAILED");
  }
  if (options.byteSize > MAX_BYTE_SIZE) {
    throw new CatalogError("Upload exceeds maximum allowed size.", "REQUEST_TOO_LARGE");
  }
  return { filename, contentType, byteSize: options.byteSize };
}

/** BE-CAT-004 — issue private upload intent; status_url carries signed PUT URL. */
export async function createMediaUploadIntent(options: {
  readonly mediaRepo: MediaRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly filename: string;
  readonly contentType: string;
  readonly byteSize: number;
}): Promise<{
  readonly data: {
    readonly job_id: string;
    readonly status: "completed";
    readonly status_url: string;
  };
  readonly meta: Record<string, never>;
}> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  const key = options.idempotencyKey?.trim();
  if (!key) {
    throw new CatalogError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const cached = await options.mediaRepo.getIdempotentMediaJob(options.tenantId, key);
  if (cached) {
    return {
      data: {
        job_id: cached.job_id,
        status: "completed",
        status_url: cached.status_url ?? ""
      },
      meta: {}
    };
  }

  const validated = validateUploadRequest(options);
  const uploadId = generateUuidV7();
  const objectKey = `tenants/${options.tenantId}/media/${uploadId}`;
  const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();
  const uploadUrl = `memory://upload/${options.tenantId}/${uploadId}?expires=${encodeURIComponent(expiresAt)}`;

  await options.mediaRepo.createUploadIntent({
    tenantId: options.tenantId,
    uploadId,
    filename: validated.filename,
    contentType: validated.contentType,
    byteSize: validated.byteSize,
    objectKey,
    uploadUrl,
    expiresAt
  });

  const job = {
    job_id: uploadId,
    status: "completed" as const,
    status_url: uploadUrl
  };
  await options.mediaRepo.saveIdempotentMediaJob(options.tenantId, key, job);
  return { data: job, meta: {} };
}

/**
 * In-memory stand-in for client PUT to signed URL.
 * Production: object-storage webhook / headObject before attach.
 */
export async function markMediaUploadComplete(options: {
  readonly mediaRepo: MediaRepository;
  readonly tenantId: string;
  readonly uploadId: string;
}): Promise<void> {
  await options.mediaRepo.markUploadBytesReceived({
    tenantId: options.tenantId,
    uploadId: options.uploadId
  });
}

/** BE-CAT-004 — attach uploaded object to product (first active variant); sync scan → clean. */
export async function attachProductMedia(options: {
  readonly mediaRepo: MediaRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly productId: string;
  readonly uploadId: string;
  readonly altText?: string | null;
  readonly sortOrder?: number | null;
}): Promise<{ readonly data: CatalogResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.write");
  const key = options.idempotencyKey?.trim();
  if (!key) {
    throw new CatalogError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const cached = await options.mediaRepo.getIdempotentMediaAttach(options.tenantId, key);
  if (cached) {
    return { data: cached, meta: {} };
  }

  await options.mediaRepo.assertProductAttachable({
    tenantId: options.tenantId,
    productId: options.productId
  });

  let upload = await options.mediaRepo.getUploadIntent({
    tenantId: options.tenantId,
    uploadId: options.uploadId
  });
  if (!upload) {
    throw new CatalogError("Upload intent not found.", "RESOURCE_NOT_FOUND");
  }
  if (new Date(upload.expiresAt).getTime() < Date.now()) {
    throw new CatalogError("Upload intent expired.", "VALIDATION_FAILED");
  }
  if (!upload.bytesReceived) {
    // In-memory: accept attach as implicit completion of the signed PUT.
    upload = await options.mediaRepo.markUploadBytesReceived({
      tenantId: options.tenantId,
      uploadId: options.uploadId
    });
  }

  const variantId = await options.mediaRepo.findFirstActiveVariantId({
    tenantId: options.tenantId,
    productId: options.productId
  });
  if (!variantId) {
    throw new CatalogError("Product has no active variant for media attach.", "VALIDATION_FAILED");
  }

  if (options.altText != null && options.altText.length > 500) {
    throw new CatalogError("alt_text too long.", "VALIDATION_FAILED");
  }
  if (options.sortOrder != null && (!Number.isInteger(options.sortOrder) || options.sortOrder < 0)) {
    throw new CatalogError("sort_order must be >= 0.", "VALIDATION_FAILED");
  }

  // Sync malware scan stub — production queues async scanner; fail-closed quarantine on reject.
  const scanStatus: MediaScanStatus = "clean";

  const media = await options.mediaRepo.attachMedia({
    tenantId: options.tenantId,
    mediaId: generateUuidV7(),
    productId: options.productId,
    variantId,
    uploadId: options.uploadId,
    objectKey: upload.objectKey,
    mediaType: upload.contentType,
    sizeBytes: upload.byteSize,
    sortOrder: options.sortOrder ?? 0,
    altText: options.altText ?? null,
    filename: upload.filename,
    scanStatus,
    checksum: null
  });

  const resource = toMediaCatalogResource(media);
  await options.mediaRepo.saveIdempotentMediaAttach(options.tenantId, key, resource);
  return { data: resource, meta: {} };
}

/** Download signing — only clean media (blueprint private bucket). */
export async function getSignedMediaDownloadUrl(options: {
  readonly mediaRepo: MediaRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly mediaId: string;
}): Promise<{ readonly url: string }> {
  requireCatalogPermission(options.actorPermissions, "catalog.read");
  const url = await options.mediaRepo.signDownloadUrl({
    tenantId: options.tenantId,
    mediaId: options.mediaId
  });
  return { url };
}
