---
ticket_id: BE-FND-016
title: Walking skeleton — auth context to DB/RLS/audit/outbox trace
owner: platform
phase: P1
risk: low
status: done
---

# Business outcome

Provide a minimal end-to-end golden path so agents and developers can copy the pattern for real features.

# In scope

- `/health` (existing)
- `POST /api/v1/_internal/walking-skeleton/trace` with header-based dev security context
- Single transaction: audit row + outbox row under tenant RLS
- Migration `000002_walking_skeleton.sql`

# Out of scope

- Real JWT auth (BE-IDN-*)
- Outbox publisher worker (BE-FND-010/011)

# Contract

- Internal endpoint only; gated by `WALKING_SKELETON_ENABLED`

# Authorization

- Permission: `audit.read` (matrix baseline; internal dev endpoint)

# Persistence

- Tables: `app.audit_events`, `app.outbox_events` with RLS

# Completion manifest

- [x] Migration `000002_walking_skeleton.sql` added
- [x] Trace endpoint in `modules/audit/` (gated by `WALKING_SKELETON_ENABLED`)
- [x] Shared `securityContextFromHeaders` (no inline header parse)
- [x] Audit payload redaction via `redactValue`
- [x] Runbook `docs/runbooks/walking-skeleton.md`
- [ ] `pnpm verify` green (re-run after this close-out; Node engines pin may fail locally)
