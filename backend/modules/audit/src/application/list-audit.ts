import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { AuthorizationError, redactSecretsDeep } from "@ai-sales/security";

export class AuditQueryError extends Error {
  constructor(
    message: string,
    readonly code: "INSUFFICIENT_PERMISSION" | "VALIDATION_FAILED"
  ) {
    super(message);
    this.name = "AuditQueryError";
  }
}

export interface AuditLogEntry {
  readonly id: string;
  readonly tenant_id: string;
  readonly action: string;
  readonly actor_id: string | null;
  readonly correlation_id: string;
  readonly payload: Record<string, unknown>;
  readonly created_at: string;
}

export interface AuditExportJob {
  readonly job_id: string;
  readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
  readonly status_url: string | null;
  readonly redacted_rows: readonly AuditLogEntry[];
}

export interface AuditLogStore {
  append(entry: Omit<AuditLogEntry, "created_at"> & { created_at?: string }): Promise<AuditLogEntry>;
  list(tenantId: string, limit?: number): Promise<readonly AuditLogEntry[]>;
  createExport(args: {
    readonly tenantId: string;
    readonly jobId: UuidV7;
    readonly from: Date;
    readonly to: Date;
    readonly actorUserId: string | null;
  }): Promise<AuditExportJob>;
  getExport(jobId: string): Promise<AuditExportJob | null>;
}

export class InMemoryAuditLogStore implements AuditLogStore {
  readonly entries: AuditLogEntry[] = [];
  readonly exports = new Map<string, AuditExportJob>();
  readonly idempotency = new Map<string, AuditExportJob>();

  async append(
    entry: Omit<AuditLogEntry, "created_at"> & { created_at?: string }
  ): Promise<AuditLogEntry> {
    const row: AuditLogEntry = {
      ...entry,
      created_at: entry.created_at ?? new Date().toISOString()
    };
    this.entries.push(row);
    return row;
  }

  async list(tenantId: string, limit = 50): Promise<readonly AuditLogEntry[]> {
    return this.entries
      .filter((e) => e.tenant_id === tenantId)
      .slice(-limit)
      .reverse();
  }

  async createExport(args: {
    readonly tenantId: string;
    readonly jobId: UuidV7;
    readonly from: Date;
    readonly to: Date;
    readonly actorUserId: string | null;
  }): Promise<AuditExportJob> {
    const rows = this.entries
      .filter((e) => {
        if (e.tenant_id !== args.tenantId) return false;
        const t = new Date(e.created_at).getTime();
        if (t < args.from.getTime() || t > args.to.getTime()) return false;
        if (args.actorUserId && e.actor_id !== args.actorUserId) return false;
        return true;
      })
      .map((e) => ({
        ...e,
        payload: redactSecretsDeep(e.payload) as Record<string, unknown>
      }));

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

function requirePerm(permissions: readonly string[], needed: string): void {
  if (!permissions.includes(needed)) {
    throw new AuditQueryError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

export async function listAuditLogs(options: {
  readonly store: AuditLogStore;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly limit?: number;
}): Promise<{
  readonly data: ReadonlyArray<{
    readonly id: string;
    readonly status: string;
    readonly created_at: string;
    readonly download_url: null;
  }>;
  readonly page_info: { readonly next_cursor: null; readonly has_more: false };
  readonly meta: Record<string, never>;
}> {
  requirePerm(options.actorPermissions, "audit.read");
  const rows = await options.store.list(options.tenantId, options.limit ?? 50);
  // Contract freeze maps list items to AuditExportResource fields; action → status.
  return {
    data: rows.map((r) => ({
      id: r.id,
      status: r.action,
      created_at: r.created_at,
      download_url: null
    })),
    page_info: { next_cursor: null, has_more: false },
    meta: {}
  };
}

export async function createAuditExport(options: {
  readonly store: AuditLogStore;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly from: string;
  readonly to: string;
  readonly actorUserId?: string | null;
  readonly idempotencyKey?: string | null;
}): Promise<{
  readonly data: {
    readonly job_id: string;
    readonly status: AuditExportJob["status"];
    readonly status_url: string | null;
  };
  readonly meta: Record<string, never>;
  readonly redacted_rows: readonly AuditLogEntry[];
}> {
  requirePerm(options.actorPermissions, "audit.export");
  const from = new Date(options.from);
  const to = new Date(options.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new AuditQueryError("Invalid from/to range.", "VALIDATION_FAILED");
  }

  if (options.idempotencyKey && options.store instanceof InMemoryAuditLogStore) {
    const hit = options.store.idempotency.get(`${options.tenantId}:${options.idempotencyKey}`);
    if (hit) {
      return {
        data: { job_id: hit.job_id, status: hit.status, status_url: hit.status_url },
        meta: {},
        redacted_rows: hit.redacted_rows
      };
    }
  }

  const job = await options.store.createExport({
    tenantId: options.tenantId,
    jobId: generateUuidV7(),
    from,
    to,
    actorUserId: options.actorUserId ?? null
  });

  if (options.idempotencyKey && options.store instanceof InMemoryAuditLogStore) {
    options.store.idempotency.set(`${options.tenantId}:${options.idempotencyKey}`, job);
  }

  // Ensure no raw secrets in export rows
  for (const row of job.redacted_rows) {
    const serialized = JSON.stringify(row.payload);
    if (/password_hash|refresh_token|totp_secret/.test(serialized) && !serialized.includes("[redacted]")) {
      throw new Error("Export leaked secrets");
    }
  }

  return {
    data: { job_id: job.job_id, status: job.status, status_url: job.status_url },
    meta: {},
    redacted_rows: job.redacted_rows
  };
}

export { AuthorizationError };
