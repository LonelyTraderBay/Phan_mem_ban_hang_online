/**
 * BE-HRD-003 — Failure injection rehearsal checklist (local compose).
 */
export const FAILURE_SCENARIOS = [
  { id: "db_restart", command: "docker compose restart postgres", expect: "api 503 then recovery < 60s" },
  { id: "redis_restart", command: "docker compose restart redis", expect: "queue backoff, no data loss" },
  { id: "provider_outage", command: "BLOCK_PROVIDER_HTTP=1", expect: "circuit breaker open, DLQ growth" }
];

export function listFailureScenarios() {
  return FAILURE_SCENARIOS;
}
