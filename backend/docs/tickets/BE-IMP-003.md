---
ticket_id: BE-IMP-003
title: Validation/dedupe/preview/error report
owner: Backend AI Agent
phase: P3
risk: medium
status: done
---

# Business outcome

Mapping update, preview checksum, row validation/dedupe, error report key.

# Completion manifest

- `updateImportMapping`, `getImportPreview`, `getImportErrors`
- Errors: `IMPORT_MAPPING_INVALID`, `IMPORT_PREVIEW_STALE`
- Tests: BE-IMP-003 section
