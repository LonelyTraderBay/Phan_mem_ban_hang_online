---
adr_id: ADR-008
title: Short-lived access JWT and opaque refresh token rotation
status: accepted
created_date: 2026-06-27
owners: [Backend AI Agent]
reviewers: [Backend AI Agent]
human_signoff_required: true # auth/session security posture
human_signoff: approved-2026-07-21
---

# Context

Sessions must support tenant membership changes, device revocation, reuse detection, and MFA step-up without long-lived bearer exposure.

# Decision

Use short-lived access JWTs with key rotation and opaque refresh tokens with family rotation and reuse detection.

For Web Admin, the Human Owner approved OIDC Authorization Code via the same-origin BFF on
2026-07-21. The BFF owns these tokens and exposes only an `HttpOnly`, `Secure`,
`SameSite=Lax`-or-stricter session cookie to the browser (ADR-FE-013). Internal email/password
login is not a Web Admin authentication channel.

# Consequences

Positive: compromised refresh tokens can be detected and revoked by family.

Trade-off: auth infrastructure is more complex than stateless long-lived JWTs.

Operational impact: session/device revoke paths and key rotation runbooks are required.

Security/privacy impact: refresh tokens are stored only as hashes.

# Verification

- Refresh rotation/reuse tests.
- JWT audience/key rotation tests.
- Session revoke and membership revoke tests.
