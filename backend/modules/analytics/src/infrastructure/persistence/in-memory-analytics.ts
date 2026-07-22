import type { ProjectionName } from "../../domain/event-taxonomy.js";
import type {
  AnalyticsRepository,
  ReportExportRecord,
  TenantDailyMetrics
} from "../../application/analytics.js";
import type { BusinessEventRecord, ProjectionWatermark } from "../../domain/projections.js";

export class InMemoryAnalyticsRepository implements AnalyticsRepository {
  readonly events: BusinessEventRecord[] = [];
  readonly watermarks = new Map<string, ProjectionWatermark>();
  readonly dailyMetrics = new Map<string, TenantDailyMetrics>();
  readonly exports = new Map<string, ReportExportRecord>();
  readonly idempotency = new Map<string, string>();

  private metricsKey(tenantId: string, date: string) {
    return `${tenantId}:${date}`;
  }

  private watermarkKey(tenantId: string, projection: ProjectionName) {
    return `${tenantId}:${projection}`;
  }

  async appendEvent(event: BusinessEventRecord): Promise<void> {
    this.events.push(event);
  }

  async listEvents(tenantId: string, limit = 100): Promise<readonly BusinessEventRecord[]> {
    return this.events.filter((e) => e.tenantId === tenantId).slice(-limit);
  }

  async getWatermark(tenantId: string, projectionName: ProjectionName): Promise<ProjectionWatermark | null> {
    return this.watermarks.get(this.watermarkKey(tenantId, projectionName)) ?? null;
  }

  async saveWatermark(watermark: ProjectionWatermark): Promise<void> {
    this.watermarks.set(this.watermarkKey(watermark.tenantId, watermark.projectionName), watermark);
  }

  async upsertDailyMetrics(metrics: TenantDailyMetrics): Promise<void> {
    this.dailyMetrics.set(this.metricsKey(metrics.tenantId, metrics.metricDate), metrics);
  }

  async getDailyMetrics(tenantId: string, metricDate: string): Promise<TenantDailyMetrics | null> {
    return this.dailyMetrics.get(this.metricsKey(tenantId, metricDate)) ?? null;
  }

  async createReportExport(exportRow: ReportExportRecord): Promise<ReportExportRecord> {
    this.exports.set(exportRow.id, exportRow);
    return exportRow;
  }

  async findExportByIdempotency(tenantId: string, key: string): Promise<ReportExportRecord | null> {
    const id = this.idempotency.get(`${tenantId}:${key}`);
    return id ? (this.exports.get(id) ?? null) : null;
  }

  async completeReportExport(id: string, tenantId: string, downloadUrl: string): Promise<ReportExportRecord> {
    const existing = this.exports.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error("export not found");
    }
    const completed: ReportExportRecord = {
      ...existing,
      status: "completed",
      downloadUrl,
      completedAt: new Date().toISOString()
    };
    this.exports.set(id, completed);
    if (existing.id) {
      const key = [...this.idempotency.entries()].find(([, v]) => v === id)?.[0];
      if (!key) {
        /* idempotency key set on create via caller */
      }
    }
    return completed;
  }

  trackIdempotency(tenantId: string, key: string, exportId: string) {
    this.idempotency.set(`${tenantId}:${key}`, exportId);
  }
}
