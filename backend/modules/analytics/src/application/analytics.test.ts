import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { BUSINESS_EVENT_TYPES, isKnownBusinessEventType } from "../domain/event-taxonomy.js";
import {
  applyProjectionEvent,
  createReportExport,
  getDashboardToday,
  getRevenueReport,
  ingestBusinessEvent,
  reconcileLateEvents,
  AnalyticsError
} from "./analytics.js";
import { InMemoryAnalyticsRepository } from "../infrastructure/persistence/in-memory-analytics.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d1b");
const tenantB = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d2b");
const orderId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e1b");

const reportPerms = [
  "report.read",
  "report.revenue.read",
  "report.profit.read",
  "report.sla.read",
  "report.ai_quality.read",
  "report.export"
];

describe("event taxonomy", () => {
  it("lists frozen business event types", () => {
    expect(BUSINESS_EVENT_TYPES.length).toBeGreaterThan(5);
    expect(isKnownBusinessEventType("order.confirmed")).toBe(true);
    expect(isKnownBusinessEventType("unknown.event")).toBe(false);
  });
});

describe("analytics application", () => {
  it("denies cross-tenant report read", async () => {
    const repo = new InMemoryAnalyticsRepository();
    await repo.upsertDailyMetrics({
      tenantId: tenantA,
      metricDate: new Date().toISOString().slice(0, 10),
      ordersCount: 3,
      revenueMinor: 100_000,
      grossProfitMinor: 20_000,
      conversationsCount: 1,
      slaBreachCount: 0,
      currency: "VND"
    });
    const report = await getRevenueReport({
      repo,
      tenantId: tenantB,
      actorPermissions: reportPerms
    });
    expect(report.data.metrics.orders_count).toBe(0);
  });

  it("projects order.confirmed into daily metrics", async () => {
    const repo = new InMemoryAnalyticsRepository();
    const event = await ingestBusinessEvent({
      repo,
      tenantId: tenantA,
      eventType: "order.confirmed",
      aggregateId: orderId,
      payload: { revenue_minor: 250_000 }
    });
    const result = await applyProjectionEvent({
      repo,
      tenantId: tenantA,
      projectionName: "order_revenue_facts",
      event
    });
    expect(result.applied).toBe(true);
    const dash = await getDashboardToday({
      repo,
      tenantId: tenantA,
      actorPermissions: reportPerms
    });
    expect(dash.data.metrics.orders_today).toBe(1);
    expect(dash.data.metrics.revenue_minor).toBe(250_000);
  });

  it("reconciles late events from watermark", async () => {
    const repo = new InMemoryAnalyticsRepository();
    await ingestBusinessEvent({
      repo,
      tenantId: tenantA,
      eventType: "order.confirmed",
      aggregateId: orderId,
      occurredAt: "2026-07-20T10:00:00.000Z",
      payload: { revenue_minor: 50_000 }
    });
    const { reprocessed } = await reconcileLateEvents({
      repo,
      tenantId: tenantA,
      projectionName: "order_revenue_facts",
      fromOccurredAt: "2026-07-20T00:00:00.000Z"
    });
    expect(reprocessed).toBeGreaterThanOrEqual(1);
  });

  it("requires idempotency key for report export", async () => {
    const repo = new InMemoryAnalyticsRepository();
    await expect(
      createReportExport({
        repo,
        tenantId: tenantA,
        actorPermissions: reportPerms,
        idempotencyKey: undefined,
        reportType: "revenue"
      })
    ).rejects.toBeInstanceOf(AnalyticsError);
  });

  it("creates signed export job", async () => {
    const repo = new InMemoryAnalyticsRepository();
    const result = await createReportExport({
      repo,
      tenantId: tenantA,
      actorPermissions: reportPerms,
      idempotencyKey: "export-1",
      reportType: "revenue"
    });
    expect(result.data.status).toBe("completed");
    expect(result.data.status_url).toContain("exports.local");
  });

  it("denies report without permission", async () => {
    const repo = new InMemoryAnalyticsRepository();
    await expect(
      getRevenueReport({ repo, tenantId: tenantA, actorPermissions: [] })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });
});
