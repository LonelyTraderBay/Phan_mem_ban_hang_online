import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import type { UuidV7 } from "@ai-sales/domain-kernel";
import { CatalogError } from "../../application/catalog.js";
import type {
  ImportJobRecord,
  ImportJobRow,
  ImportRepository,
  ImportSourceType
} from "../../application/import-jobs.js";

type JobRow = {
  id: string;
  tenant_id: string;
  source_type: ImportSourceType;
  upload_id: string | null;
  status: ImportJobRecord["status"];
  file_key: string | null;
  file_checksum: string | null;
  mapping: Record<string, string> | string;
  preview_checksum: string | null;
  row_count: string | number | null;
  error_count: string | number | null;
  error_report_key: string | null;
  metrics: Record<string, number> | string;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type StagingRow = {
  id: string;
  tenant_id: string;
  import_job_id: string;
  row_number: number;
  raw: Record<string, string> | string;
  canonical: Record<string, string> | string;
  validation_errors: readonly string[] | string;
  row_status: ImportJobRow["rowStatus"];
  applied_entity_ids: readonly string[] | string;
};

function asObject<T extends Record<string, unknown>>(value: T | string): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value;
}

function asStringArray(value: readonly string[] | string): string[] {
  if (typeof value === "string") return JSON.parse(value) as string[];
  return [...value];
}

function toJobRecord(row: JobRow): ImportJobRecord {
  const mapping = asObject(row.mapping as Record<string, string>);
  const metrics = asObject(row.metrics as Record<string, number>);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sourceType: row.source_type,
    uploadId: row.upload_id,
    status: row.status,
    fileKey: row.file_key,
    fileChecksum: row.file_checksum,
    mapping,
    previewChecksum: row.preview_checksum,
    rowCount: row.row_count == null ? null : Number(row.row_count),
    errorCount: row.error_count == null ? null : Number(row.error_count),
    errorReportKey: row.error_report_key,
    metrics,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function toStagingRow(row: StagingRow): ImportJobRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    importJobId: row.import_job_id,
    rowNumber: Number(row.row_number),
    raw: asObject(row.raw as Record<string, string>),
    canonical: asObject(row.canonical as Record<string, string>),
    validationErrors: asStringArray(row.validation_errors),
    rowStatus: row.row_status,
    appliedEntityIds: asStringArray(row.applied_entity_ids)
  };
}

type JobResponse = {
  readonly job_id: string;
  readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
  readonly status_url: string | null;
};

/** v1 process-local idempotency — migrate to app.idempotency_records when wired. */
export class PostgresImportRepository implements ImportRepository {
  private readonly idempotency = new Map<string, JobResponse>();

  constructor(private readonly db: AppDatabase) {}

  private idemKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  async createJob(args: {
    readonly tenantId: string;
    readonly jobId: UuidV7;
    readonly sourceType: ImportSourceType;
    readonly uploadId: string | null;
  }): Promise<ImportJobRecord> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<JobRow>`
        insert into app.import_jobs (
          id, tenant_id, source_type, upload_id, status, mapping, metrics, version
        ) values (
          ${args.jobId}::uuid,
          ${args.tenantId}::uuid,
          ${args.sourceType},
          ${args.uploadId}::uuid,
          'uploaded',
          '{}'::jsonb,
          '{}'::jsonb,
          1
        )
        returning id, tenant_id, source_type, upload_id, status, file_key, file_checksum,
                  mapping, preview_checksum, row_count, error_count, error_report_key,
                  metrics, version, created_at, updated_at
      `.execute(trx);
      return toJobRecord(result.rows[0]!);
    });
  }

  async getJob(args: {
    readonly tenantId: string;
    readonly jobId: string;
  }): Promise<ImportJobRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<JobRow>`
        select id, tenant_id, source_type, upload_id, status, file_key, file_checksum,
               mapping, preview_checksum, row_count, error_count, error_report_key,
               metrics, version, created_at, updated_at
        from app.import_jobs
        where id = ${args.jobId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      const row = result.rows[0];
      return row ? toJobRecord(row) : null;
    });
  }

  async saveJob(job: ImportJobRecord): Promise<void> {
    const ctx = adapterSecurityContext(job.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      // Application bumps version before save; require previous row version.
      const previousVersion = job.version - 1;
      const updated = await sql<{ id: string }>`
        update app.import_jobs
        set status = ${job.status},
            file_key = ${job.fileKey},
            file_checksum = ${job.fileChecksum},
            mapping = ${JSON.stringify(job.mapping)}::jsonb,
            preview_checksum = ${job.previewChecksum},
            row_count = ${job.rowCount},
            error_count = ${job.errorCount},
            error_report_key = ${job.errorReportKey},
            metrics = ${JSON.stringify(job.metrics)}::jsonb,
            version = ${job.version},
            updated_at = ${job.updatedAt}::timestamptz
        where id = ${job.id}::uuid
          and tenant_id = ${job.tenantId}::uuid
          and version = ${previousVersion}
        returning id
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new CatalogError("Import job version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
    });
  }

  async replaceRows(args: {
    readonly tenantId: string;
    readonly jobId: string;
    readonly rows: readonly ImportJobRow[];
  }): Promise<void> {
    const ctx = adapterSecurityContext(args.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      const job = await sql<{ id: string }>`
        select id from app.import_jobs
        where id = ${args.jobId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      if (!job.rows[0]) return;

      await sql`
        delete from app.import_job_rows
        where tenant_id = ${args.tenantId}::uuid and import_job_id = ${args.jobId}::uuid
      `.execute(trx);

      for (const row of args.rows) {
        await sql`
          insert into app.import_job_rows (
            id, tenant_id, import_job_id, row_number, raw, canonical,
            validation_errors, applied_entity_ids, row_status
          ) values (
            ${row.id}::uuid,
            ${args.tenantId}::uuid,
            ${args.jobId}::uuid,
            ${row.rowNumber},
            ${JSON.stringify(row.raw)}::jsonb,
            ${JSON.stringify(row.canonical)}::jsonb,
            ${JSON.stringify(row.validationErrors)}::jsonb,
            ${JSON.stringify(row.appliedEntityIds)}::jsonb,
            ${row.rowStatus}
          )
        `.execute(trx);
      }
    });
  }

  async listRows(args: {
    readonly tenantId: string;
    readonly jobId: string;
  }): Promise<readonly ImportJobRow[]> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<StagingRow>`
        select id, tenant_id, import_job_id, row_number, raw, canonical,
               validation_errors, row_status, applied_entity_ids
        from app.import_job_rows
        where tenant_id = ${args.tenantId}::uuid and import_job_id = ${args.jobId}::uuid
        order by row_number asc
      `.execute(trx);
      return result.rows.map(toStagingRow);
    });
  }

  async getIdempotentJobResponse(tenantId: string, key: string): Promise<JobResponse | null> {
    return this.idempotency.get(this.idemKey(tenantId, key)) ?? null;
  }

  async saveIdempotentJobResponse(
    tenantId: string,
    key: string,
    response: JobResponse
  ): Promise<void> {
    this.idempotency.set(this.idemKey(tenantId, key), response);
  }
}
