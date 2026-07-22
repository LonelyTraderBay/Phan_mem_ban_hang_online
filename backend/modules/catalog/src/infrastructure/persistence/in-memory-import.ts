import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import type {
  ImportJobRecord,
  ImportJobRow,
  ImportRepository,
  ImportSourceType
} from "../../application/import-jobs.js";
import type { ImportApplyPort } from "../../application/import-jobs.js";
import type { CatalogRepository } from "../../application/catalog.js";
import { createProduct, createVariant, listVariants } from "../../application/catalog.js";

export class InMemoryImportRepository implements ImportRepository {
  readonly jobs = new Map<string, ImportJobRecord>();
  readonly rowsByJob = new Map<string, ImportJobRow[]>();
  private readonly idempotency = new Map<
    string,
    {
      job_id: string;
      status: "queued" | "running" | "completed" | "failed" | "cancelled";
      status_url: string | null;
    }
  >();

  async createJob(args: {
    readonly tenantId: string;
    readonly jobId: UuidV7;
    readonly sourceType: ImportSourceType;
    readonly uploadId: string | null;
  }): Promise<ImportJobRecord> {
    const now = new Date().toISOString();
    const job: ImportJobRecord = {
      id: args.jobId,
      tenantId: args.tenantId,
      sourceType: args.sourceType,
      uploadId: args.uploadId,
      status: "uploaded",
      fileKey: null,
      fileChecksum: null,
      mapping: {},
      previewChecksum: null,
      rowCount: null,
      errorCount: null,
      errorReportKey: null,
      metrics: {},
      version: 1,
      createdAt: now,
      updatedAt: now
    };
    this.jobs.set(job.id, job);
    this.rowsByJob.set(job.id, []);
    return job;
  }

  async getJob(args: {
    readonly tenantId: string;
    readonly jobId: string;
  }): Promise<ImportJobRecord | null> {
    const job = this.jobs.get(args.jobId);
    if (!job || job.tenantId !== args.tenantId) return null;
    return job;
  }

  async saveJob(job: ImportJobRecord): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async replaceRows(args: {
    readonly tenantId: string;
    readonly jobId: string;
    readonly rows: readonly ImportJobRow[];
  }): Promise<void> {
    const job = this.jobs.get(args.jobId);
    if (!job || job.tenantId !== args.tenantId) return;
    this.rowsByJob.set(args.jobId, [...args.rows]);
  }

  async listRows(args: {
    readonly tenantId: string;
    readonly jobId: string;
  }): Promise<readonly ImportJobRow[]> {
    const job = this.jobs.get(args.jobId);
    if (!job || job.tenantId !== args.tenantId) return [];
    return this.rowsByJob.get(args.jobId) ?? [];
  }

  async getIdempotentJobResponse(
    tenantId: string,
    key: string
  ): Promise<{
    readonly job_id: string;
    readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
    readonly status_url: string | null;
  } | null> {
    return this.idempotency.get(`${tenantId}:${key}`) ?? null;
  }

  async saveIdempotentJobResponse(
    tenantId: string,
    key: string,
    response: {
      readonly job_id: string;
      readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
      readonly status_url: string | null;
    }
  ): Promise<void> {
    this.idempotency.set(`${tenantId}:${key}`, response);
  }
}

/** Apply import rows into in-memory catalog (create product+variant per new SKU). */
export function createInMemoryImportApplyPort(catalog: CatalogRepository): ImportApplyPort {
  return {
    async upsertVariantFromImport(args) {
      const listed = await listVariants({
        repo: catalog,
        tenantId: args.tenantId,
        actorPermissions: ["catalog.read"]
      });
      const existing = listed.data.find((v) => v.name === args.sku && v.status === "active");
      if (existing) {
        return { entityId: existing.id };
      }
      const product = await createProduct({
        repo: catalog,
        tenantId: args.tenantId,
        actorPermissions: ["catalog.write"],
        idempotencyKey: `import-product:${args.sku}`,
        name: args.name,
        status: "active"
      });
      const variant = await createVariant({
        repo: catalog,
        tenantId: args.tenantId,
        actorPermissions: ["catalog.write"],
        actorId: generateUuidV7(),
        idempotencyKey: `import-variant:${args.sku}`,
        productId: product.data.id,
        sku: args.sku,
        unitPriceMinor: args.unitPriceMinor
      });
      return { entityId: variant.data.id };
    }
  };
}
