---
adr_id: ADR-012
title: Audit export remains synchronous with process-local job maps in v1
status: accepted
created_date: 2026-07-23
owners: [Backend AI Agent]
reviewers: [Backend AI Agent]
human_signoff_required: false
---

# Context

The audit export endpoint already reads tenant-scoped `app.audit_events`, redacts secrets, and
returns a completed export result. The current Postgres adapter has no export-jobs table or worker;
it stores completed results and idempotency replays in process-local `Map` instances. Changing this
to a durable asynchronous job would change the current v1 response and add migration, retention,
and worker work.

# Decision

Keep audit export **synchronous for v1**.

- `app.audit_events` remains the source of truth and is read under tenant RLS.
- Export rows are redacted before they leave the backend.
- The process-local `Map` used by `getExport` and export idempotency is acceptable for v1 cache and
  replay behavior; it is not durable audit data.
- Do not add a durable export-jobs table or worker until export volume, duration, or multi-instance
  status requirements make it necessary.

# Alternatives considered

| Alternative | Benefits | Costs/Risks | Rejection reason |
|---|---|---|---|
| Durable export job + worker | Survives restarts and supports large exports | New schema, queue, retention, and download lifecycle | Not required by the current v1 contract |
| Process-local synchronous export | Small surface and immediate completion | Job lookup/cache is lost on restart or another replica | Accepted for v1 with explicit scale limitation |

# Consequences

## Positive

The existing API, redaction path, tenant isolation, and idempotency behavior remain stable without
introducing speculative persistence.

## Negative / trade-offs

Large exports can consume request time, and `status_url` lookup is only coherent on the process that
created the export.

## Operational impact

Monitor export duration, row count, memory use, and failures. A follow-up ADR is required before
claiming durable multi-instance export status.

## Security/privacy impact

Every export remains permission-gated by `audit.export`, tenant-scoped, and checked for redaction;
the process-local maps must remain keyed by tenant plus idempotency/job identity where applicable.

## Migration and rollback

No migration is required. Roll back by reverting the consumer of the current synchronous export
implementation; audit rows are unaffected.

# Verification

- Audit list/export tests cover permission denial, tenant filtering, secret redaction, and replay.
- Postgres adapter tests keep RLS-scoped reads and completed export behavior green.
- Revisit when export duration, row limits, or horizontal scaling requires durable jobs.
