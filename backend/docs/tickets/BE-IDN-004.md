---
ticket_id: BE-IDN-004
title: Access JWT key rotation/validation/audience
owner: Backend AI Agent
phase: P2
risk: high
status: done
---

# Business outcome

Validate access JWT issuer/audience/exp; dual-key rotation window.

# Actor and use case

Bearer clients (Windows desktop PKCE / service) that present `Authorization: Bearer` access JWTs.
Web Admin remains cookie-only (BE-IDN-003); this ticket does **not** put tokens in browser JS.

# In scope / Out of scope

In scope: Access JWT issue + verify (ES256), issuer/audience/exp checks, `kid` dual-accept rotation window, Bearer parse helper, map claims → `RequestSecurityContext` (permissions server-supplied).

Out of scope: refresh family rotation (BE-IDN-005); Web Admin cookie→JWT; JWKS HTTP endpoint (optional later); Nest global guard wiring for every route (helper ready).

# Dependencies

Blocked on **BE-IDN-003** — unblocked.

See also: `docs/adr/ADR-008-jwt-refresh-token-rotation.md`, `docs/tickets/BE-IDN-test-matrix.md`.

# Domain invariants and state transitions

- Server establishes tenant context; never trust client `tenant_id` for authorization (JWT `tid` seeds context only).
- Permissions are **not** trusted from JWT claims — caller resolves permissions server-side.
- Money N/A; refresh tokens remain hashed-only (IDN-005).

# Contract

- OpenAPI: existing `bearerAuth` + `AuthResponse.access_token` (desktop only) — no schema change required.
- Error codes: `AUTH_TOKEN_EXPIRED`, `AUTH_INVALID_CREDENTIALS` (wrong aud/iss/kid/sig).

# Authorization and data classification

- Access JWT is the bearer session gate for non-cookie clients.
- Private signing keys = restricted; redacted in config dumps.

# Persistence and migration

- None (stateless JWT; keys from env/KMS later).

# Transaction, concurrency and idempotency

- N/A for verify middleware.

# Audit, telemetry and operations

- Rotate: set new `JWT_ACTIVE_*`, keep prior as `JWT_PREVIOUS_*` until access TTL window elapses, then drop previous.
- Rollback: revert active kid/key; dual-window still accepts prior during TTL.

# Acceptance criteria

- Valid token accepted
- Wrong audience rejected
- Expired → AUTH_TOKEN_EXPIRED
- Rotation dual-accept window tested
- Rotated key rejected after window closes
- [x] Permission/tenant isolation tests per BE-IDN-test-matrix (JWT claims → context; permissions not from token)
- [x] Contract/generated client note — OpenAPI unchanged; FE/desktop use existing bearerAuth
- [x] Completion manifest filled

# Test cases

See `docs/tickets/BE-IDN-test-matrix.md` row `BE-IDN-004`.

Evidence: `packages/security/src/access-token.test.ts` — 7 passed.

# Completion manifest

- Contracts changed: none
- Migration: none
- Tests/evidence: `pnpm exec vitest run packages/security` — 7 passed; `pnpm typecheck` OK
- Known risks: Nest global bearer guard not mounted on all routes yet (consume via `createAccessTokenService` / `loadAccessTokenService`); production keys must come from KMS/secret manager, not repo
