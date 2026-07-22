---
adr_id: ADR-010
title: Expand/contract migrations and build-once promote
status: accepted
created_date: 2026-06-27
owners: [Backend AI Agent]
reviewers: [Backend AI Agent]
human_signoff_required: false
---

# Context

Production releases must be rollbackable. Destructive schema changes deployed with incompatible code create avoidable downtime and data loss.

# Decision

Use immutable forward migrations, expand/contract for risky schema changes, and build-once-promote for container images. The same image digest moves from CI to staging to production.

# Consequences

Positive: safer rollback and clearer supply-chain provenance.

Trade-off: removing old columns/behavior takes multiple releases.

Operational impact: CI must produce SBOM/provenance and migration compatibility evidence.

Security/privacy impact: signed immutable images reduce tampering risk.

# Verification

- Fresh and upgrade migration tests.
- Image digest promotion evidence.
- Rollback rehearsal before production release.
