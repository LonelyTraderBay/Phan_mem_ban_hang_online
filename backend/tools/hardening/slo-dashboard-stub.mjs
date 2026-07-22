/**
 * BE-HRD-006 — SLO dashboard stub definitions (Grafana JSON fragments).
 */
export const SLO_PANELS = [
  { title: "API availability", query: "sum(rate(http_requests_total{status!~'5..'}[5m]))", target: 0.999 },
  { title: "P95 latency", query: "histogram_quantile(0.95, http_request_duration_seconds)", targetMs: 500 },
  { title: "Error budget burn", query: "slo:error_budget:burn_rate_1h", target: 1 }
];
