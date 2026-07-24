import { describe, expect, it } from "vitest";
import { METRIC_CATALOG } from "./metricCatalog";

describe("metric catalog", () => {
  it("contains the analytics keys exposed by dashboard and report APIs", () => {
    const ids = METRIC_CATALOG.metrics.map((metric) => metric.id);

    expect(ids).toEqual(
      expect.arrayContaining(["orders_today", "conversations_today", "revenue_minor"]),
    );
    expect(METRIC_CATALOG.metrics.every((metric) => metric.label.trim().length > 0)).toBe(true);
  });
});
