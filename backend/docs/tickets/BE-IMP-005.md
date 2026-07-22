---
ticket_id: BE-IMP-005
title: Large import resumability/cancellation/metrics
owner: Backend AI Agent
phase: P3
risk: medium
status: done
---

# Business outcome

Cancel before apply; job metrics map for applied/cancelled counts.

# Completion manifest

- `cancelImport` (pre-apply only), `getImportMetrics`
- Chunked resume for large files: staging rows retained; re-analyze/confirm seams ready
- Tests: BE-IMP-005 section
