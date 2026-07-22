import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import type { UuidV7 } from "@ai-sales/domain-kernel";
import { redactSecretsDeep } from "@ai-sales/security";
import type {
  AuditExportJob,
  AuditLogEntry,
  AuditLogStore
} from "../../application/list-audit.js";

type AuditRow = {
  id: string;
  tenant_id: string;
  action: string;
  actor_id: string | null;
  correlation_id: string;
  payload: unknown;
  created_at: Date;
};

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function toEntry(row: AuditRow): AuditLogEntry {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    action: row.action,
    actor_id: row.actor_id,
    correlation_id: row.correlation_id,
    payload: parsePayload(row.payload),
    created_at: toIso(row.created_at)
  };
}

/**
 * Reads/writes app.audit_events under tenant RLS.
 * Export jobs are sync (no jobs table) — results cached process-locally for getExport.
 */
export class PostgresAuditLogStore implements AuditLogStore {
  private readonly exports = new Map<string, AuditExportJob>();
  readonly idempotency = new Map<string, AuditExportJob>();

  constructor(private readonly db: AppDatabase) {}

  async append(
    entry: Omit<AuditLogEntry, "created_at"> & { created_at?: string }
  ): Promise<AuditLogEntry> {
    const actorId = entry.actor_id ?? "018f0000-0000-7000-8000-000000000001";
    const ctx = adapterSecurityContext(entry.tenant_id, actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const createdAt = entry.created_at ?? new Date().toISOString();
      const result = await sql<AuditRow>`
        insert into app.audit_events (
          id, tenant_id, action, actor_id, correlation_id, payload, created_at
        ) values (
          ${entry.id}::uuid,
          ${entry.tenant_id}::uuid,
          ${entry.action},
          ${actorId}::uuid,
          ${entry.correlation_id},
          ${JSON.stringify(entry.payload)}::jsonb,
          ${createdAt}::timestamptz
        )
        returning id, tenant_id, action, actor_id, correlation_id, payload, created_at
      `.execute(trx);
      return toEntry(result.rows[0]!);
    });
  }

  async list(tenantId: string, limit = 50): Promise<readonly AuditLogEntry[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<AuditRow>`
        select id, tenant_id, action, actor_id, correlation_id, payload, created_at
        from app.audit_events
        where tenant_id = ${tenantId}::uuid
        order by created_at desc, id desc
        limit ${limit}
      `.execute(trx);
      return result.rows.map(toEntry);
    });
  }

  async createExport(args: {
    readonly tenantId: string;
    readonly jobId: UuidV7;
    readonly from: Date;
    readonly to: Date;
    readonly actorUserId: string | null;
  }): Promise<AuditExportJob> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorUserId ?? undefined);
    const rows = await withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<AuditRow>`
        select id, tenant_id, action, actor_id, correlation_id, payload, created_at
        from app.audit_events
        where tenant_id = ${args.tenantId}::uuid
          and created_at >= ${args.from.toISOString()}::timestamptz
          and created_at <= ${args.to.toISOString()}::timestamptz
          and (
            ${args.actorUserId}::uuid is null
            or actor_id = ${args.actorUserId}::uuid
          )
        order by created_at asc, id asc
      `.execute(trx);
      return result.rows.map((row) => {
        const entry = toEntry(row);
        return {
          ...entry,
          payload: redactSecretsDeep(entry.payload) as Record<string, unknown>
        };
      });
    });

    const job: AuditExportJob = {
      job_id: args.jobId,
      status: "completed",
      status_url: `/api/v1/jobs/${args.jobId}`,
      redacted_rows: rows
    };
    this.exports.set(args.jobId, job);
    return job;
  }

  async getExport(jobId: string): Promise<AuditExportJob | null> {
    return this.exports.get(jobId) ?? null;
  }
}
