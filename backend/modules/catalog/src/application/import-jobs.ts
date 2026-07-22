import { createHash } from "node:crypto";
import type { IdempotencyStore } from "@ai-sales/idempotency";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { CatalogError, requireCatalogPermission } from "./catalog.js";
import { runCatalogIdempotent } from "./catalog-idempotency.js";

/**
 * BE-IMP-001…005 — Catalog import job pipeline (in-memory until Postgres adapter).
 * Domain status follows OpenAPI ImportJobResource; JobResponse uses queued/running/…
 */

export type ImportSourceType = "csv" | "xlsx" | "api";

export type ImportDomainStatus =
  | "uploaded"
  | "mapped"
  | "analyzing"
  | "preview_ready"
  | "confirming"
  | "applied"
  | "failed"
  | "cancelled";

export type ImportJobResource = {
  readonly id: string;
  readonly tenant_id: string;
  readonly source_type: ImportSourceType;
  readonly status: ImportDomainStatus;
  readonly row_count: number | null;
  readonly error_count: number | null;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
};

export type ImportJobRow = {
  readonly id: string;
  readonly tenantId: string;
  readonly importJobId: string;
  readonly rowNumber: number;
  readonly raw: Record<string, string>;
  readonly canonical: Record<string, string>;
  readonly validationErrors: readonly string[];
  readonly rowStatus: "staged" | "valid" | "invalid" | "applied" | "skipped";
  readonly appliedEntityIds: readonly string[];
};

export type ImportJobRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceType: ImportSourceType;
  readonly uploadId: string | null;
  status: ImportDomainStatus;
  fileKey: string | null;
  fileChecksum: string | null;
  mapping: Record<string, string>;
  previewChecksum: string | null;
  rowCount: number | null;
  errorCount: number | null;
  errorReportKey: string | null;
  metrics: Record<string, number>;
  version: number;
  readonly createdAt: string;
  updatedAt: string;
};

export interface ImportRepository {
  createJob(args: {
    readonly tenantId: string;
    readonly jobId: UuidV7;
    readonly sourceType: ImportSourceType;
    readonly uploadId: string | null;
  }): Promise<ImportJobRecord>;
  getJob(args: {
    readonly tenantId: string;
    readonly jobId: string;
  }): Promise<ImportJobRecord | null>;
  saveJob(job: ImportJobRecord): Promise<void>;
  replaceRows(args: {
    readonly tenantId: string;
    readonly jobId: string;
    readonly rows: readonly ImportJobRow[];
  }): Promise<void>;
  listRows(args: {
    readonly tenantId: string;
    readonly jobId: string;
  }): Promise<readonly ImportJobRow[]>;
  getIdempotentJobResponse(
    tenantId: string,
    key: string
  ): Promise<{
    readonly job_id: string;
    readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
    readonly status_url: string | null;
  } | null>;
  saveIdempotentJobResponse(
    tenantId: string,
    key: string,
    response: {
      readonly job_id: string;
      readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
      readonly status_url: string | null;
    }
  ): Promise<void>;
}

function toResource(job: ImportJobRecord): ImportJobResource {
  return {
    id: job.id,
    tenant_id: job.tenantId,
    source_type: job.sourceType,
    status: job.status,
    row_count: job.rowCount,
    error_count: job.errorCount,
    version: job.version,
    created_at: job.createdAt,
    updated_at: job.updatedAt
  };
}

/** Map domain import status → frozen JobResponse status enum. */
export function toJobResponseStatus(
  status: ImportDomainStatus
): "queued" | "running" | "completed" | "failed" | "cancelled" {
  switch (status) {
    case "uploaded":
    case "mapped":
      return "queued";
    case "analyzing":
    case "confirming":
      return "running";
    case "preview_ready":
    case "applied":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

function bump(job: ImportJobRecord, status: ImportDomainStatus): ImportJobRecord {
  job.status = status;
  job.version += 1;
  job.updatedAt = new Date().toISOString();
  return job;
}

function requireJob(
  job: ImportJobRecord | null,
  allowed: readonly ImportDomainStatus[]
): ImportJobRecord {
  if (!job) {
    throw new CatalogError("Import job not found.", "RESOURCE_NOT_FOUND");
  }
  if (!allowed.includes(job.status)) {
    throw new CatalogError("Import job state invalid for this operation.", "IMPORT_JOB_STATE_INVALID");
  }
  return job;
}

function parseSourceType(raw: string | undefined): ImportSourceType {
  if (raw === "csv" || raw === "xlsx" || raw === "api") return raw;
  throw new CatalogError("source_type must be csv, xlsx, or api.", "VALIDATION_FAILED");
}

export function computePreviewChecksum(job: ImportJobRecord, rows: readonly ImportJobRow[]): string {
  const payload = JSON.stringify({
    mapping: job.mapping,
    rows: rows.map((r) => ({ n: r.rowNumber, c: r.canonical, e: r.validationErrors }))
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// BE-IMP-001 — create + get
// ---------------------------------------------------------------------------

export async function createImportJob(options: {
  readonly repo: ImportRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly idempotency?: IdempotencyStore;
  readonly sourceType: string;
  readonly uploadId?: string | null;
}): Promise<{
  readonly data: {
    readonly job_id: string;
    readonly status: "queued";
    readonly status_url: string;
  };
  readonly meta: Record<string, never>;
}> {
  requireCatalogPermission(options.actorPermissions, "catalog.import");
  const key = options.idempotencyKey?.trim();
  if (!key) {
    throw new CatalogError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  type CreateResult = {
    readonly data: {
      readonly job_id: string;
      readonly status: "queued";
      readonly status_url: string;
    };
    readonly meta: Record<string, never>;
  };
  return runCatalogIdempotent<CreateResult>({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "catalog.import.create",
    key,
    loadCached: async () => {
      const cached = await options.repo.getIdempotentJobResponse(options.tenantId, key);
      if (!cached) return null;
      return {
        data: {
          job_id: cached.job_id,
          status: "queued" as const,
          status_url: cached.status_url ?? `/api/v1/imports/${cached.job_id}`
        },
        meta: {}
      };
    },
    rememberCached: async (result) => {
      await options.repo.saveIdempotentJobResponse(options.tenantId, key, result.data);
    },
    resourceId: (result) => result.data.job_id,
    execute: async () => {
      const sourceType = parseSourceType(options.sourceType);
      const job = await options.repo.createJob({
        tenantId: options.tenantId,
        jobId: generateUuidV7(),
        sourceType,
        uploadId: options.uploadId ?? null
      });
      return {
        data: {
          job_id: job.id,
          status: "queued" as const,
          status_url: `/api/v1/imports/${job.id}`
        },
        meta: {}
      };
    }
  });
}

export async function getImportJob(options: {
  readonly repo: ImportRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly jobId: string;
}): Promise<{
  readonly data: {
    readonly job_id: string;
    readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
    readonly status_url: string;
  };
  readonly meta: Record<string, never>;
}> {
  requireCatalogPermission(options.actorPermissions, "catalog.read");
  const job = await options.repo.getJob({ tenantId: options.tenantId, jobId: options.jobId });
  if (!job) {
    throw new CatalogError("Import job not found.", "RESOURCE_NOT_FOUND");
  }
  return {
    data: {
      job_id: job.id,
      status: toJobResponseStatus(job.status),
      status_url: `/api/v1/imports/${job.id}`
    },
    meta: {}
  };
}

// ---------------------------------------------------------------------------
// BE-IMP-002 — analyze / parse / mapping detection
// ---------------------------------------------------------------------------

/** Minimal CSV: first row headers, comma-separated, UTF-8. */
export function parseCsvStaging(content: string): {
  readonly headers: string[];
  readonly rows: readonly Record<string, string>[];
} {
  const text = content.replace(/^\uFEFF/, "");
  if (!text.trim()) {
    throw new CatalogError("Import file is empty.", "IMPORT_FILE_INVALID");
  }
  if (text.includes("\0")) {
    throw new CatalogError("Import file encoding invalid.", "IMPORT_FILE_INVALID");
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new CatalogError("Import file needs a header and at least one data row.", "IMPORT_FILE_INVALID");
  }
  const headers = lines[0]!.split(",").map((h) => h.trim());
  if (headers.length === 0 || headers.some((h) => !h)) {
    throw new CatalogError("Import file headers invalid.", "IMPORT_FILE_INVALID");
  }
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

function detectMapping(headers: readonly string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const key = h.toLowerCase().replace(/\s+/g, "_");
    if (["sku", "product_sku", "variant_sku"].includes(key)) mapping[h] = "sku";
    else if (["name", "product_name", "title"].includes(key)) mapping[h] = "name";
    else if (["price", "unit_price", "unit_price_minor", "price_minor"].includes(key)) {
      mapping[h] = "unit_price_minor";
    } else if (["barcode", "ean"].includes(key)) mapping[h] = "barcode";
  }
  return mapping;
}

export async function analyzeImport(options: {
  readonly repo: ImportRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly idempotency?: IdempotencyStore;
  readonly jobId: string;
  /** In-memory CSV body; production reads from upload object key. */
  readonly csvContent?: string;
}): Promise<{
  readonly data: {
    readonly job_id: string;
    readonly status: "running" | "completed";
    readonly status_url: string;
  };
  readonly meta: Record<string, never>;
}> {
  requireCatalogPermission(options.actorPermissions, "catalog.import");
  const key = options.idempotencyKey?.trim();
  if (!key) {
    throw new CatalogError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const cacheKey = `analyze:${key}`;
  type AnalyzeResult = {
    readonly data: {
      readonly job_id: string;
      readonly status: "running" | "completed";
      readonly status_url: string;
    };
    readonly meta: Record<string, never>;
  };
  return runCatalogIdempotent<AnalyzeResult>({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "catalog.import.analyze",
    key,
    loadCached: async () => {
      const cached = await options.repo.getIdempotentJobResponse(options.tenantId, cacheKey);
      if (!cached) return null;
      return {
        data: {
          job_id: cached.job_id,
          status:
            cached.status === "queued"
              ? ("running" as const)
              : (cached.status as "running" | "completed"),
          status_url: cached.status_url ?? `/api/v1/imports/${cached.job_id}`
        },
        meta: {}
      };
    },
    rememberCached: async (result) => {
      await options.repo.saveIdempotentJobResponse(options.tenantId, cacheKey, {
        job_id: result.data.job_id,
        status: result.data.status,
        status_url: result.data.status_url
      });
    },
    resourceId: (result) => result.data.job_id,
    execute: async () => {
      const job = requireJob(
        await options.repo.getJob({ tenantId: options.tenantId, jobId: options.jobId }),
        ["uploaded", "mapped", "failed"]
      );
      bump(job, "analyzing");
      await options.repo.saveJob(job);

      const csv =
        options.csvContent ??
        "sku,name,unit_price_minor\nSKU-1,Sample,10000\nSKU-2,Sample Two,20000\n";
      let parsed: { headers: string[]; rows: readonly Record<string, string>[] };
      try {
        parsed = parseCsvStaging(csv);
      } catch (error) {
        bump(job, "failed");
        await options.repo.saveJob(job);
        throw error;
      }

      if (Object.keys(job.mapping).length === 0) {
        job.mapping = detectMapping(parsed.headers);
      }
      job.fileChecksum = createHash("sha256").update(csv, "utf8").digest("hex");
      job.fileKey = job.fileKey ?? `imports/${job.tenantId}/${job.id}.csv`;

      const staged: ImportJobRow[] = parsed.rows.map((raw, idx) => ({
        id: generateUuidV7(),
        tenantId: job.tenantId,
        importJobId: job.id,
        rowNumber: idx + 1,
        raw,
        canonical: {},
        validationErrors: [],
        rowStatus: "staged",
        appliedEntityIds: []
      }));
      await options.repo.replaceRows({ tenantId: job.tenantId, jobId: job.id, rows: staged });
      job.rowCount = staged.length;
      bump(job, "mapped");
      await options.repo.saveJob(job);

      return {
        data: {
          job_id: job.id,
          status: "completed" as const,
          status_url: `/api/v1/imports/${job.id}`
        },
        meta: {}
      };
    }
  });
}

// ---------------------------------------------------------------------------
// BE-IMP-003 — mapping / validate / preview / errors
// ---------------------------------------------------------------------------

function applyMapping(
  raw: Record<string, string>,
  mapping: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [source, canonical] of Object.entries(mapping)) {
    if (raw[source] !== undefined) out[canonical] = raw[source]!;
  }
  return out;
}

function validateCanonical(canonical: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!canonical.sku?.trim()) errors.push("sku required");
  if (!canonical.name?.trim()) errors.push("name required");
  if (canonical.unit_price_minor != null && canonical.unit_price_minor !== "") {
    const n = Number(canonical.unit_price_minor);
    if (!Number.isInteger(n) || n < 0) errors.push("unit_price_minor invalid");
  }
  return errors;
}

export async function updateImportMapping(options: {
  readonly repo: ImportRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly jobId: string;
  readonly expectedVersion: number;
  readonly mapping: Record<string, string>;
}): Promise<{ readonly data: ImportJobResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.import");
  const job = requireJob(await options.repo.getJob({ tenantId: options.tenantId, jobId: options.jobId }), [
    "uploaded",
    "mapped",
    "preview_ready",
    "failed"
  ]);
  if (job.version !== options.expectedVersion) {
    throw new CatalogError("Import preview/mapping version mismatch.", "IMPORT_PREVIEW_STALE");
  }
  if (!options.mapping || Object.keys(options.mapping).length === 0) {
    throw new CatalogError("mapping required.", "IMPORT_MAPPING_INVALID");
  }
  const values = Object.values(options.mapping);
  if (!values.includes("sku") || !values.includes("name")) {
    throw new CatalogError("mapping must include sku and name.", "IMPORT_MAPPING_INVALID");
  }
  job.mapping = { ...options.mapping };
  bump(job, "mapped");
  await options.repo.saveJob(job);
  return { data: toResource(job), meta: {} };
}

export async function buildImportPreview(options: {
  readonly repo: ImportRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly jobId: string;
}): Promise<{ readonly data: ImportJobResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.read");
  const job = requireJob(await options.repo.getJob({ tenantId: options.tenantId, jobId: options.jobId }), [
    "mapped",
    "preview_ready",
    "analyzing"
  ]);
  if (Object.keys(job.mapping).length === 0) {
    throw new CatalogError("mapping missing; analyze or update mapping first.", "IMPORT_MAPPING_INVALID");
  }
  const rows = [...(await options.repo.listRows({ tenantId: options.tenantId, jobId: options.jobId }))];
  const seenSku = new Set<string>();
  let errorCount = 0;
  const validated: ImportJobRow[] = rows.map((row) => {
    const canonical = applyMapping(row.raw, job.mapping);
    const errors = [...validateCanonical(canonical)];
    const sku = canonical.sku?.trim().toUpperCase();
    if (sku) {
      if (seenSku.has(sku)) errors.push("duplicate sku in file");
      else seenSku.add(sku);
    }
    if (errors.length) errorCount += 1;
    return {
      ...row,
      canonical,
      validationErrors: errors,
      rowStatus: errors.length ? ("invalid" as const) : ("valid" as const)
    };
  });
  await options.repo.replaceRows({ tenantId: options.tenantId, jobId: options.jobId, rows: validated });
  job.rowCount = validated.length;
  job.errorCount = errorCount;
  job.previewChecksum = computePreviewChecksum(job, validated);
  bump(job, "preview_ready");
  await options.repo.saveJob(job);
  return { data: toResource(job), meta: {} };
}

export async function getImportPreview(options: {
  readonly repo: ImportRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly jobId: string;
}): Promise<{ readonly data: ImportJobResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.read");
  const job = await options.repo.getJob({ tenantId: options.tenantId, jobId: options.jobId });
  if (!job) throw new CatalogError("Import job not found.", "RESOURCE_NOT_FOUND");
  if (job.status === "mapped" || job.status === "analyzing") {
    return buildImportPreview(options);
  }
  requireJob(job, ["preview_ready", "confirming", "applied"]);
  return { data: toResource(job), meta: {} };
}

export async function getImportErrors(options: {
  readonly repo: ImportRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly jobId: string;
}): Promise<{ readonly data: ImportJobResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.read");
  const job = requireJob(await options.repo.getJob({ tenantId: options.tenantId, jobId: options.jobId }), [
    "preview_ready",
    "failed",
    "confirming",
    "applied"
  ]);
  job.errorReportKey = job.errorReportKey ?? `imports/${job.tenantId}/${job.id}/errors.json`;
  // Bump version so Postgres saveJob optimistic lock (version = previous) succeeds.
  job.version += 1;
  job.updatedAt = new Date().toISOString();
  await options.repo.saveJob(job);
  return { data: toResource(job), meta: {} };
}

// ---------------------------------------------------------------------------
// BE-IMP-004 — confirm / apply atomic merge into catalog staging (variants by SKU)
// ---------------------------------------------------------------------------

export type ImportApplyPort = {
  upsertVariantFromImport(args: {
    readonly tenantId: string;
    readonly sku: string;
    readonly name: string;
    readonly unitPriceMinor: number;
  }): Promise<{ readonly entityId: string }>;
};

export async function confirmImport(options: {
  readonly repo: ImportRepository;
  readonly applyPort: ImportApplyPort;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly idempotency?: IdempotencyStore;
  readonly jobId: string;
  readonly expectedPreviewChecksum?: string | null;
}): Promise<{
  readonly data: {
    readonly job_id: string;
    readonly status: "running" | "completed" | "failed";
    readonly status_url: string;
  };
  readonly meta: Record<string, never>;
}> {
  requireCatalogPermission(options.actorPermissions, "catalog.import");
  const key = options.idempotencyKey?.trim();
  if (!key) {
    throw new CatalogError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const cacheKey = `confirm:${key}`;
  type ConfirmResult = {
    readonly data: {
      readonly job_id: string;
      readonly status: "running" | "completed" | "failed";
      readonly status_url: string;
    };
    readonly meta: Record<string, never>;
  };
  return runCatalogIdempotent<ConfirmResult>({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "catalog.import.confirm",
    key,
    loadCached: async () => {
      const cached = await options.repo.getIdempotentJobResponse(options.tenantId, cacheKey);
      if (!cached) return null;
      return {
        data: {
          job_id: cached.job_id,
          status:
            cached.status === "cancelled"
              ? ("failed" as const)
              : (cached.status as "running" | "completed" | "failed"),
          status_url: cached.status_url ?? `/api/v1/imports/${cached.job_id}`
        },
        meta: {}
      };
    },
    rememberCached: async (result) => {
      await options.repo.saveIdempotentJobResponse(options.tenantId, cacheKey, {
        job_id: result.data.job_id,
        status: result.data.status,
        status_url: result.data.status_url
      });
    },
    resourceId: (result) => result.data.job_id,
    execute: async () => {
      const job = requireJob(
        await options.repo.getJob({ tenantId: options.tenantId, jobId: options.jobId }),
        ["preview_ready"]
      );
      const rows = await options.repo.listRows({
        tenantId: options.tenantId,
        jobId: options.jobId
      });
      const checksum = computePreviewChecksum(job, rows);
      if (job.previewChecksum !== checksum) {
        throw new CatalogError("Preview checksum mismatch.", "IMPORT_PREVIEW_STALE");
      }
      if (
        options.expectedPreviewChecksum &&
        options.expectedPreviewChecksum !== job.previewChecksum
      ) {
        throw new CatalogError("Client preview checksum stale.", "IMPORT_PREVIEW_STALE");
      }
      if ((job.errorCount ?? 0) > 0) {
        throw new CatalogError("Cannot confirm import with row errors.", "IMPORT_JOB_STATE_INVALID");
      }

      bump(job, "confirming");
      await options.repo.saveJob(job);

      try {
        const appliedRows: ImportJobRow[] = [];
        for (const row of rows) {
          if (row.rowStatus !== "valid") {
            appliedRows.push(row);
            continue;
          }
          const price = Number(row.canonical.unit_price_minor ?? "0");
          const result = await options.applyPort.upsertVariantFromImport({
            tenantId: options.tenantId,
            sku: row.canonical.sku!.trim().toUpperCase(),
            name: row.canonical.name!.trim(),
            unitPriceMinor: Number.isFinite(price) ? price : 0
          });
          appliedRows.push({
            ...row,
            rowStatus: "applied",
            appliedEntityIds: [result.entityId]
          });
        }
        await options.repo.replaceRows({
          tenantId: options.tenantId,
          jobId: options.jobId,
          rows: appliedRows
        });
        job.metrics = {
          ...job.metrics,
          applied_rows: appliedRows.filter((r) => r.rowStatus === "applied").length
        };
        bump(job, "applied");
        await options.repo.saveJob(job);
      } catch (error) {
        bump(job, "failed");
        await options.repo.saveJob(job);
        throw new CatalogError(
          error instanceof Error ? error.message : "Import apply failed.",
          "IMPORT_APPLY_FAILED"
        );
      }

      return {
        data: {
          job_id: job.id,
          status: "completed" as const,
          status_url: `/api/v1/imports/${job.id}`
        },
        meta: {}
      };
    }
  });
}

// ---------------------------------------------------------------------------
// BE-IMP-005 — cancel + metrics
// ---------------------------------------------------------------------------

export async function cancelImport(options: {
  readonly repo: ImportRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly jobId: string;
}): Promise<{ readonly data: ImportJobResource; readonly meta: Record<string, never> }> {
  requireCatalogPermission(options.actorPermissions, "catalog.import");
  const key = options.idempotencyKey?.trim();
  if (!key) {
    throw new CatalogError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const job = requireJob(await options.repo.getJob({ tenantId: options.tenantId, jobId: options.jobId }), [
    "uploaded",
    "mapped",
    "analyzing",
    "preview_ready",
    "failed"
  ]);
  // Cancel only before apply (blueprint §10.4) — confirming/applied rejected by allow-list.
  bump(job, "cancelled");
  job.metrics = { ...job.metrics, cancelled: 1 };
  await options.repo.saveJob(job);
  return { data: toResource(job), meta: {} };
}

export function getImportMetrics(job: ImportJobRecord): Record<string, number> {
  return { ...job.metrics, version: job.version, row_count: job.rowCount ?? 0 };
}
