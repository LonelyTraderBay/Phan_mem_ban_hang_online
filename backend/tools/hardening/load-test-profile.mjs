/**
 * BE-HRD-002 — Capacity/load test skeleton (k6-compatible JSON export).
 * Run against staging only — not production.
 */
export const LOAD_TEST_PROFILE = {
  name: "api-read-smoke",
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 50 },
    { duration: "30s", target: 0 }
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"]
  },
  endpoints: ["/api/v1/health", "/api/v1/dashboard/today"]
} as const;
