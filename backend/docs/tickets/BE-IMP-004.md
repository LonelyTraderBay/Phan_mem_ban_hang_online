---
ticket_id: BE-IMP-004
title: Confirm/apply idempotent atomic merge
owner: Backend AI Agent
phase: P3
risk: high
status: done
---

# Business outcome

Idempotent confirm/apply of valid preview rows into catalog (SKU upsert).

# Completion manifest

- `confirmImport` + `ImportApplyPort`
- Errors: `IMPORT_PREVIEW_STALE`, `IMPORT_APPLY_FAILED`, `IMPORT_JOB_STATE_INVALID`
- Tests: BE-IMP-004 section
