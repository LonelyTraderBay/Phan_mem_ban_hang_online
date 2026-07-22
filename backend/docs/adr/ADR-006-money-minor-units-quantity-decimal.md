---
adr_id: ADR-006
title: Money minor units and decimal quantities
status: accepted
created_date: 2026-06-27
owners: [Backend AI Agent]
reviewers: [Backend AI Agent, Frontend AI Agent]
human_signoff_required: true # money representation is a business-risk area, not purely technical
---

# Context

Floating point arithmetic can corrupt totals, discounts, tax, inventory valuation, and payment reconciliation.

# Decision

Store money as integer minor units plus currency. Store quantities as decimal with explicit scale. Do not use floating point for money.

# Consequences

Positive: deterministic calculation and reconciliation.

Trade-off: API and UI formatting need explicit conversion.

Operational impact: import and provider adapters must normalize currency/minor units.

Security/privacy impact: price/cost/profit fields still require field-level authorization.

# Verification

- Domain kernel rejects floating point money.
- Order/payment calculation property tests in P7.
- Provider callback reconciliation tests.
