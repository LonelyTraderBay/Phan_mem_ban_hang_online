export const MODULE_NAME = "analytics" as const;

export {
  AnalyticsError,
  applyProjectionEvent,
  createReportExport,
  getAiQualityReportFromFacts,
  getDashboardToday,
  getGrossProfitReport,
  getRevenueReport,
  getSlaReport,
  ingestBusinessEvent,
  reconcileLateEvents,
  requireAnalyticsPermission,
  type AnalyticsPermission,
  type AnalyticsRepository
} from "./application/analytics.js";

export { BUSINESS_EVENT_TYPES, isKnownBusinessEventType } from "./domain/event-taxonomy.js";
export { assessQueryLoad } from "./domain/query-assessment.js";
export { InMemoryAnalyticsRepository } from "./infrastructure/persistence/in-memory-analytics.js";
export { createAnalyticsController } from "./presentation/http/analytics.controller.js";
