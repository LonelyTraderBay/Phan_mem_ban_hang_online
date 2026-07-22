---
adr_id: ADR-003
title: OpenAPI-first HTTP contracts and generated artifacts
status: accepted
created_date: 2026-06-27
owners: [Backend AI Agent]
reviewers: [Backend AI Agent, Frontend AI Agent]
human_signoff_required: false
---

# Context

Frontend, desktop clients, mocks, and tests need stable contracts. Hand-maintained duplicated types drift.

# Decision

Use OpenAPI 3.1.1 and JSON Schema 2020-12 as the source for HTTP API contracts. Generated clients/types/mock artifacts are derived from contracts, not hand-maintained.

# Consequences

Positive: consumers can validate compatibility before implementation.

Trade-off: feature work starts with contract edits and contract linting.

Operational impact: CI blocks drift between `backend_doc/contracts` and workspace contract packages.

Security/privacy impact: response schemas must omit restricted fields rather than relying on frontend hiding.

# Verification

- `pnpm contracts:validate`.
- OpenAPI lint and breaking-change check in P1.
- Generated client compile gate in P1.
