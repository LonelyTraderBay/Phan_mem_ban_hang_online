---
adr_id: ADR-009
title: AI zero-trust, tool-mediated, risk-approved actions
status: accepted
created_date: 2026-06-27
owners: [Backend AI Agent]
reviewers: [Backend AI Agent]
human_signoff_required: true # AI risk/governance policy
---

# Context

AI output and tool planning are untrusted. The system handles customer data, inventory, orders, payments, and business communications.

# Decision

AI must act only through policy-enforced tool APIs. AI cannot access business tables directly, bypass authorization, or execute high-risk mutations without risk-class approval and audit.

# Consequences

Positive: AI agency is bounded by the same policy layer as users and services.

Trade-off: AI features require tool schema, evals, logs, approval workflows, and rollback before production activation.

Operational impact: prompt/model/tool versions, cost, latency, and kill switches must be observable.

Security/privacy impact: prompt, source, tool, and policy logs must be redacted and access-controlled.

# Verification

- AI-R001 to AI-R010 tests in P8.
- Tool permission/idempotency tests.
- Eval gate before prompt/model activation.
