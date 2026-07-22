---
adr_id: ADR-007
title: UUIDv7, UTC timestamptz, and tenant timezone presentation
status: accepted
created_date: 2026-06-27
owners: [Backend AI Agent]
reviewers: [Backend AI Agent]
human_signoff_required: false
---

# Context

Public sequential IDs leak information and create enumeration risk. Time handling must support global tenants and local business reporting.

# Decision

Use UUIDv7 for public IDs, `timestamptz` stored in UTC for instants, and tenant timezone for presentation and business-date aggregation.

# Consequences

Positive: sortable IDs without sequential integer exposure.

Trade-off: data model and API examples must be strict about timestamp semantics.

Operational impact: reports and daily facts must store timezone assumptions.

Security/privacy impact: ID format does not replace authorization or RLS.

# Verification

- ID parser tests.
- API examples use RFC 3339 timestamps.
- Analytics tests include tenant timezone cases.
