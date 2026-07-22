import { generateUuidV7 } from "@ai-sales/domain-kernel";
import type { BusinessEventType, ProjectionName } from "../domain/event-taxonomy.js";
import { classifyEventAggregate } from "../domain/event-taxonomy.js";
import {
  nextWatermark,
  shouldApplyEvent,
  type BusinessEventRecord,
  type ProjectionWatermark
} from "../domain/projections.js";
import { assessQueryLoad } from "../domain/query-assessment.js";

/**
 * BE-DAT-001…010 — Analytics application layer (in-memory until Postgres adapter).
 */

export type AnalyticsPermission =
  | "report.read"
  | "report.revenue.read"
  | "report.profit.read"
  | "report.sla.read"
  | "report.ai_quality.read"
  | "report.export";

export type AnalyticsErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "IDEMPOTENCY_KEY_REQUIRED";

export class AnalyticsError extends Error {
  constructor(
    message: string,
    readonly code: AnalyticsErrorCode
  ) {
    super(message);
    this.name = "AnalyticsError";
  }
}

export interface TenantDailyMetrics {
  readonly tenantId: string;
  readonly metricDate: string;
  readonly ordersCount: number;
  readonly revenueMinor: number;
  readonly grossProfitMinor: number;
  readonly conversationsCount: number;
  readonly slaBreachCount: number;
  readonly currency: string;
}

export interface ReportExportRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly reportType: "revenue" | "gross_profit" | "sla" | "ai_quality";
  readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
  readonly fromAt: string | null;
  readonly toAt: string | null;
  readonly downloadUrl: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
  /** Persisted on Postgres via unique partial index; InMemory uses trackIdempotency. */
  readonly idempotencyKey?: string | null;
}

export interface AnalyticsRepository {
  appendEvent(event: BusinessEventRecord): Promise<void>;
  listEvents(tenantId: string, limit?: number): Promise<readonly BusinessEventRecord[]>;
  getWatermark(tenantId: string, projectionName: ProjectionName): Promise<ProjectionWatermark | null>;
  saveWatermark(watermark: ProjectionWatermark): Promise<void>;
  upsertDailyMetrics(metrics: TenantDailyMetrics): Promise<void>;
  getDailyMetrics(tenantId: string, metricDate: string): Promise<TenantDailyMetrics | null>;
  createReportExport(exportRow: ReportExportRecord): Promise<ReportExportRecord>;
  findExportByIdempotency(tenantId: string, key: string): Promise<ReportExportRecord | null>;
  completeReportExport(id: string, tenantId: string, downloadUrl: string): Promise<ReportExportRecord>;
}

function emptyPage() {
  return { next_cursor: null as null, has_more: false as const };
}

function reportResource(metrics: Record<string, number | string | null>, currency = "VND") {
  return {
    generated_at: new Date().toISOString(),
    currency,
    metrics
  };
}

export function requireAnalyticsPermission(
  actorPermissions: readonly string[],
  permission: AnalyticsPermission
): void {
  if (!actorPermissions.includes(permission)) {
    throw new AnalyticsError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

export function ingestBusinessEvent(options: {
  readonly repo: AnalyticsRepository;
  readonly tenantId: string;
  readonly eventType: BusinessEventType;
  readonly aggregateId: string;
  readonly occurredAt?: string;
  readonly payload?: Record<string, unknown>;
  readonly sourceEventId?: string | null;
}): Promise<BusinessEventRecord> {
  const event: BusinessEventRecord = {
    id: generateUuidV7(),
    tenantId: options.tenantId,
    eventType: options.eventType,
    aggregateType: classifyEventAggregate(options.eventType),
    aggregateId: options.aggregateId,
    occurredAt: options.occurredAt ?? new Date().toISOString(),
    payload: options.payload ?? {},
    sourceEventId: options.sourceEventId ?? null
  };
  return options.repo.appendEvent(event).then(() => event);
}

export async function applyProjectionEvent(options: {
  readonly repo: AnalyticsRepository;
  readonly tenantId: string;
  readonly projectionName: ProjectionName;
  readonly event: BusinessEventRecord;
}): Promise<{ readonly applied: boolean; readonly watermark: ProjectionWatermark }> {
  const watermark = await options.repo.getWatermark(options.tenantId, options.projectionName);
  if (!shouldApplyEvent(watermark, options.event)) {
    return { applied: false, watermark: watermark! };
  }
  const next = nextWatermark(watermark, options.event, options.projectionName, new Date());
  await options.repo.saveWatermark(next);

  if (options.projectionName === "order_revenue_facts" && options.event.eventType === "order.confirmed") {
    const revenueMinor = Number(options.event.payload.revenue_minor ?? 0);
    const today = options.event.occurredAt.slice(0, 10);
    const existing = await options.repo.getDailyMetrics(options.tenantId, today);
    await options.repo.upsertDailyMetrics({
      tenantId: options.tenantId,
      metricDate: today,
      ordersCount: (existing?.ordersCount ?? 0) + 1,
      revenueMinor: (existing?.revenueMinor ?? 0) + revenueMinor,
      grossProfitMinor: existing?.grossProfitMinor ?? 0,
      conversationsCount: existing?.conversationsCount ?? 0,
      slaBreachCount: existing?.slaBreachCount ?? 0,
      currency: "VND"
    });
  }

  return { applied: true, watermark: next };
}

export async function reconcileLateEvents(options: {
  readonly repo: AnalyticsRepository;
  readonly tenantId: string;
  readonly projectionName: ProjectionName;
  readonly fromOccurredAt: string;
}): Promise<{ readonly reprocessed: number }> {
  const events = await options.repo.listEvents(options.tenantId, 500);
  let reprocessed = 0;
  for (const event of events) {
    if (event.occurredAt >= options.fromOccurredAt) {
      const result = await applyProjectionEvent({
        repo: options.repo,
        tenantId: options.tenantId,
        projectionName: options.projectionName,
        event
      });
      if (result.applied) reprocessed += 1;
    }
  }
  return { reprocessed };
}

export async function getDashboardToday(options: {
  readonly repo: AnalyticsRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireAnalyticsPermission(options.actorPermissions, "report.read");
  const today = new Date().toISOString().slice(0, 10);
  const metrics = await options.repo.getDailyMetrics(options.tenantId, today);
  const assessment = assessQueryLoad("dashboard_today");
  return {
    data: reportResource({
      orders_today: metrics?.ordersCount ?? 0,
      revenue_minor: metrics?.revenueMinor ?? 0,
      conversations_today: metrics?.conversationsCount ?? 0,
      sla_breaches_today: metrics?.slaBreachCount ?? 0,
      freshness_watermark: metrics ? today : null,
      query_assessment: assessment.notes
    }),
    meta: {}
  };
}

async function buildReport(
  repo: AnalyticsRepository,
  tenantId: string,
  reportType: "revenue" | "gross_profit" | "sla" | "ai_quality"
) {
  const today = new Date().toISOString().slice(0, 10);
  const metrics = await repo.getDailyMetrics(tenantId, today);
  const assessment = assessQueryLoad(reportType);
  const base = {
    orders_count: metrics?.ordersCount ?? 0,
    revenue_minor: metrics?.revenueMinor ?? 0,
    gross_profit_minor: metrics?.grossProfitMinor ?? 0,
    sla_breach_count: metrics?.slaBreachCount ?? 0,
    conversations_count: metrics?.conversationsCount ?? 0,
    query_assessment: assessment.notes
  };
  return reportResource(base);
}

export async function getRevenueReport(options: {
  readonly repo: AnalyticsRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireAnalyticsPermission(options.actorPermissions, "report.revenue.read");
  return { data: await buildReport(options.repo, options.tenantId, "revenue"), meta: {}, page_info: emptyPage() };
}

export async function getGrossProfitReport(options: {
  readonly repo: AnalyticsRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireAnalyticsPermission(options.actorPermissions, "report.profit.read");
  return { data: await buildReport(options.repo, options.tenantId, "gross_profit"), meta: {}, page_info: emptyPage() };
}

export async function getSlaReport(options: {
  readonly repo: AnalyticsRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireAnalyticsPermission(options.actorPermissions, "report.sla.read");
  return { data: await buildReport(options.repo, options.tenantId, "sla"), meta: {}, page_info: emptyPage() };
}

export async function getAiQualityReportFromFacts(options: {
  readonly repo: AnalyticsRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireAnalyticsPermission(options.actorPermissions, "report.ai_quality.read");
  return { data: await buildReport(options.repo, options.tenantId, "ai_quality"), meta: {}, page_info: emptyPage() };
}

export async function createReportExport(options: {
  readonly repo: AnalyticsRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly reportType: "revenue" | "gross_profit" | "sla" | "ai_quality";
  readonly fromAt?: string | null;
  readonly toAt?: string | null;
}) {
  requireAnalyticsPermission(options.actorPermissions, "report.export");
  if (!options.idempotencyKey?.trim()) {
    throw new AnalyticsError("Idempotency-Key header required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const cached = await options.repo.findExportByIdempotency(options.tenantId, options.idempotencyKey);
  if (cached) {
    return {
      data: { job_id: cached.id, status: cached.status, status_url: null },
      meta: {}
    };
  }
  const id = generateUuidV7();
  const created = await options.repo.createReportExport({
    id,
    tenantId: options.tenantId,
    reportType: options.reportType,
    status: "queued",
    fromAt: options.fromAt ?? null,
    toAt: options.toAt ?? null,
    downloadUrl: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    idempotencyKey: options.idempotencyKey
  });
  if ("trackIdempotency" in options.repo && typeof (options.repo as { trackIdempotency?: Function }).trackIdempotency === "function") {
    (options.repo as { trackIdempotency: (t: string, k: string, id: string) => void }).trackIdempotency(
      options.tenantId,
      options.idempotencyKey,
      created.id
    );
  }
  const completed = await options.repo.completeReportExport(
    created.id,
    options.tenantId,
    `https://exports.local/${options.tenantId}/${created.id}.csv`
  );
  return {
    data: { job_id: completed.id, status: completed.status, status_url: completed.downloadUrl },
    meta: {}
  };
}
