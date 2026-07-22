import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import { generateUuidV7 } from "@ai-sales/domain-kernel";
import type {
  AnalyticsRepository,
  ReportExportRecord,
  TenantDailyMetrics
} from "../../application/analytics.js";
import type { ProjectionName } from "../../domain/event-taxonomy.js";
import type { BusinessEventRecord, ProjectionWatermark } from "../../domain/projections.js";

type EventRow = {
  id: string;
  tenant_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  occurred_at: Date;
  payload: unknown;
  source_event_id: string | null;
};

type WatermarkRow = {
  tenant_id: string;
  projection_name: string;
  last_event_id: string | null;
  last_occurred_at: Date | null;
  updated_at: Date;
};

type MetricsRow = {
  tenant_id: string;
  metric_date: string | Date;
  orders_count: number | string;
  revenue_minor: number | string;
  gross_profit_minor: number | string;
  conversations_count: number | string;
  sla_breach_count: number | string;
  currency: string;
};

type ExportRow = {
  id: string;
  tenant_id: string;
  report_type: ReportExportRecord["reportType"];
  status: ReportExportRecord["status"];
  from_at: Date | null;
  to_at: Date | null;
  download_url: string | null;
  created_at: Date;
  completed_at: Date | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toDateOnly(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function parseObject(value: unknown): Record<string, unknown> {
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

function toEvent(row: EventRow): BusinessEventRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    eventType: row.event_type as BusinessEventRecord["eventType"],
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    occurredAt: toIso(row.occurred_at)!,
    payload: parseObject(row.payload),
    sourceEventId: row.source_event_id
  };
}

function toWatermark(row: WatermarkRow): ProjectionWatermark {
  return {
    tenantId: row.tenant_id,
    projectionName: row.projection_name as ProjectionName,
    lastEventId: row.last_event_id,
    lastOccurredAt: toIso(row.last_occurred_at),
    updatedAt: toIso(row.updated_at)!
  };
}

function toMetrics(row: MetricsRow): TenantDailyMetrics {
  return {
    tenantId: row.tenant_id,
    metricDate: toDateOnly(row.metric_date),
    ordersCount: Number(row.orders_count),
    revenueMinor: Number(row.revenue_minor),
    grossProfitMinor: Number(row.gross_profit_minor),
    conversationsCount: Number(row.conversations_count),
    slaBreachCount: Number(row.sla_breach_count),
    currency: row.currency
  };
}

function toExport(row: ExportRow): ReportExportRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    reportType: row.report_type,
    status: row.status,
    fromAt: toIso(row.from_at),
    toAt: toIso(row.to_at),
    downloadUrl: row.download_url,
    createdAt: toIso(row.created_at)!,
    completedAt: toIso(row.completed_at)
  };
}

export class PostgresAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly db: AppDatabase) {}

  async appendEvent(event: BusinessEventRecord): Promise<void> {
    const ctx = adapterSecurityContext(event.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        insert into app.event_logs (
          id, tenant_id, event_type, aggregate_type, aggregate_id,
          occurred_at, payload, source_event_id
        ) values (
          ${event.id}::uuid,
          ${event.tenantId}::uuid,
          ${event.eventType},
          ${event.aggregateType},
          ${event.aggregateId}::uuid,
          ${event.occurredAt}::timestamptz,
          ${JSON.stringify(event.payload)}::jsonb,
          ${event.sourceEventId}::uuid
        )
      `.execute(trx);
    });
  }

  async listEvents(tenantId: string, limit = 100): Promise<readonly BusinessEventRecord[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<EventRow>`
        select id, tenant_id, event_type, aggregate_type, aggregate_id,
               occurred_at, payload, source_event_id
        from (
          select id, tenant_id, event_type, aggregate_type, aggregate_id,
                 occurred_at, payload, source_event_id
          from app.event_logs
          where tenant_id = ${tenantId}::uuid
          order by occurred_at desc, id desc
          limit ${limit}
        ) recent
        order by occurred_at asc, id asc
      `.execute(trx);
      return result.rows.map(toEvent);
    });
  }

  async getWatermark(
    tenantId: string,
    projectionName: ProjectionName
  ): Promise<ProjectionWatermark | null> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<WatermarkRow>`
        select tenant_id, projection_name, last_event_id, last_occurred_at, updated_at
        from app.projection_watermarks
        where tenant_id = ${tenantId}::uuid
          and projection_name = ${projectionName}
      `.execute(trx);
      const row = result.rows[0];
      return row ? toWatermark(row) : null;
    });
  }

  async saveWatermark(watermark: ProjectionWatermark): Promise<void> {
    const ctx = adapterSecurityContext(watermark.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        insert into app.projection_watermarks (
          tenant_id, projection_name, last_event_id, last_occurred_at, updated_at
        ) values (
          ${watermark.tenantId}::uuid,
          ${watermark.projectionName},
          ${watermark.lastEventId}::uuid,
          ${watermark.lastOccurredAt}::timestamptz,
          ${watermark.updatedAt}::timestamptz
        )
        on conflict (tenant_id, projection_name) do update set
          last_event_id = excluded.last_event_id,
          last_occurred_at = excluded.last_occurred_at,
          updated_at = excluded.updated_at
      `.execute(trx);
    });
  }

  async upsertDailyMetrics(metrics: TenantDailyMetrics): Promise<void> {
    const ctx = adapterSecurityContext(metrics.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      const id = generateUuidV7();
      await sql`
        insert into app.daily_tenant_metrics (
          id, tenant_id, metric_date, orders_count, revenue_minor, gross_profit_minor,
          conversations_count, sla_breach_count, currency, metadata
        ) values (
          ${id}::uuid,
          ${metrics.tenantId}::uuid,
          ${metrics.metricDate}::date,
          ${metrics.ordersCount},
          ${metrics.revenueMinor},
          ${metrics.grossProfitMinor},
          ${metrics.conversationsCount},
          ${metrics.slaBreachCount},
          ${metrics.currency},
          '{}'::jsonb
        )
        on conflict (tenant_id, metric_date) do update set
          orders_count = excluded.orders_count,
          revenue_minor = excluded.revenue_minor,
          gross_profit_minor = excluded.gross_profit_minor,
          conversations_count = excluded.conversations_count,
          sla_breach_count = excluded.sla_breach_count,
          currency = excluded.currency
      `.execute(trx);
    });
  }

  async getDailyMetrics(
    tenantId: string,
    metricDate: string
  ): Promise<TenantDailyMetrics | null> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<MetricsRow>`
        select tenant_id, metric_date, orders_count, revenue_minor, gross_profit_minor,
               conversations_count, sla_breach_count, currency
        from app.daily_tenant_metrics
        where tenant_id = ${tenantId}::uuid
          and metric_date = ${metricDate}::date
      `.execute(trx);
      const row = result.rows[0];
      return row ? toMetrics(row) : null;
    });
  }

  async createReportExport(exportRow: ReportExportRecord): Promise<ReportExportRecord> {
    const ctx = adapterSecurityContext(exportRow.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<ExportRow>`
        insert into app.report_exports (
          id, tenant_id, report_type, status, from_at, to_at, download_url,
          idempotency_key, created_at, completed_at
        ) values (
          ${exportRow.id}::uuid,
          ${exportRow.tenantId}::uuid,
          ${exportRow.reportType},
          ${exportRow.status},
          ${exportRow.fromAt}::timestamptz,
          ${exportRow.toAt}::timestamptz,
          ${exportRow.downloadUrl},
          ${exportRow.idempotencyKey ?? null},
          ${exportRow.createdAt}::timestamptz,
          ${exportRow.completedAt}::timestamptz
        )
        returning id, tenant_id, report_type, status, from_at, to_at, download_url,
                  created_at, completed_at
      `.execute(trx);
      return toExport(result.rows[0]!);
    });
  }

  async findExportByIdempotency(
    tenantId: string,
    key: string
  ): Promise<ReportExportRecord | null> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<ExportRow>`
        select id, tenant_id, report_type, status, from_at, to_at, download_url,
               created_at, completed_at
        from app.report_exports
        where tenant_id = ${tenantId}::uuid
          and idempotency_key = ${key}
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      return row ? toExport(row) : null;
    });
  }

  async completeReportExport(
    id: string,
    tenantId: string,
    downloadUrl: string
  ): Promise<ReportExportRecord> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<ExportRow>`
        update app.report_exports
        set status = 'completed',
            download_url = ${downloadUrl},
            completed_at = now()
        where id = ${id}::uuid and tenant_id = ${tenantId}::uuid
        returning id, tenant_id, report_type, status, from_at, to_at, download_url,
                  created_at, completed_at
      `.execute(trx);
      if (!result.rows[0]) {
        throw new Error("export not found");
      }
      return toExport(result.rows[0]);
    });
  }
}
