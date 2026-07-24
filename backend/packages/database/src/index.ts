import type { Generated } from "kysely";
import type { RequestSecurityContext } from "@ai-sales/auth-context";
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import { Pool } from "pg";

export interface AuditEventsTable {
  id: string;
  tenant_id: string;
  action: string;
  actor_id: string;
  correlation_id: string;
  payload: Record<string, unknown>;
  created_at: Generated<Date>;
}

export interface AuditLogsTable {
  id: string;
  tenant_id: string | null;
  action: string;
  actor_id: string | null;
  correlation_id: string;
  resource_type: string | null;
  resource_id: string | null;
  payload: Record<string, unknown>;
  integrity_hash: string | null;
  created_at: Generated<Date>;
}

export interface OutboxEventsTable {
  id: string;
  tenant_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  created_at: Generated<Date>;
  published_at: Date | null;
}

export interface IdempotencyRecordsTable {
  tenant_id: string;
  actor_id: string;
  operation_id: string;
  idempotency_key: string;
  request_hash: string;
  status: "processing" | "completed" | "failed_retryable" | "failed_final";
  resource_id: string | null;
  response_status: number | null;
  response_body_redacted: Record<string, unknown> | null;
  created_at: Generated<Date>;
  expires_at: Date;
}

export interface InboxEventsTable {
  consumer_name: string;
  event_id: string;
  tenant_id: string;
  status: "processing" | "processed" | "failed";
  payload_hash: string | null;
  error: string | null;
  first_seen_at: Generated<Date>;
  processed_at: Date | null;
}

export interface Database {
  "app.audit_events": AuditEventsTable;
  "app.audit_logs": AuditLogsTable;
  "app.outbox_events": OutboxEventsTable;
  "app.idempotency_records": IdempotencyRecordsTable;
  "app.inbox_events": InboxEventsTable;
}

export type AppDatabase = Kysely<Database>;
export type AppTransaction = Transaction<Database>;

export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantContextError";
  }
}

function requireNonEmpty(field: string, value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TenantContextError(`${field} must be a non-empty string.`);
  }
  return value;
}

export function assertTenantSecurityContext(ctx: RequestSecurityContext): void {
  requireNonEmpty("tenantId", ctx.tenantId);
  requireNonEmpty("actorId", ctx.actorId);
  requireNonEmpty("correlationId", ctx.correlationId);
}

export function createDatabase(databaseUrl: string): AppDatabase {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: databaseUrl,
        statement_timeout: 10_000
      })
    })
  });
}

export { adapterSecurityContext } from "./adapter-context.js";
export { purgeEphemeralRows, type EphemeralPurgeCounts } from "./ephemeral-purge.js";

export async function withTenantTransaction<T>(
  db: AppDatabase,
  ctx: RequestSecurityContext,
  fn: (trx: AppTransaction) => Promise<T>
): Promise<T> {
  assertTenantSecurityContext(ctx);
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`.execute(trx);
    await sql`select set_config('app.actor_id', ${ctx.actorId}, true)`.execute(trx);
    await sql`select set_config('app.correlation_id', ${ctx.correlationId}, true)`.execute(trx);
    return fn(trx);
  });
}
