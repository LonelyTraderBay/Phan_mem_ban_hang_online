# Identity module

## Purpose

Authentication, sessions, credentials, MFA, devices, refresh tokens.

## Owned data

See `docs/data/data-dictionary.md` (Identity / Tenant section) and
`docs/data/identity-migration-design.md` (`000005_identity_schema.sql`).

Primary tables: `users`, `user_credentials`, `user_sessions`, `refresh_tokens`,
`devices`, `mfa_factors`, `recovery_codes` (plus shared identity touch on invitations
accept flows).

## OpenAPI tags

Auth, Sessions

## Task IDs

`BE-IDN-*` — tickets in `docs/tickets/`. Test matrix: `docs/tickets/BE-IDN-test-matrix.md`.

## Recommended ticket order

| Order | Ticket | Status gate |
|---|---|---|
| 1 | **BE-IDN-001** schema + RLS (`000005`) | ready — start here |
| 2 | BE-IDN-002 tenant provision / owner invite | blocked on 001 |
| 3 | BE-IDN-003 password login + CSRF (GAP-006) | blocked on 001 |
| 4 | BE-IDN-004 access JWT | blocked on 003 |
| 5 | BE-IDN-005 refresh family | blocked on 004 |
| 6 | BE-IDN-006 logout / device revoke + events | blocked on 005 |
| 7 | BE-IDN-007 password reset | blocked on 003 |
| 8 | BE-IDN-008 MFA / GAP-008 verify body | blocked on 003 |
| 9 | BE-IDN-009 switch tenant + `/me` bootstrap | blocked on 003+005 |
| 10 | BE-IDN-015 security suite | blocked on 001–014 |

Member/role tickets that touch this module's sessions: BE-IDN-010…014 live primarily under
`modules/tenant` but depend on identity schema/login.

## Agent read order

1. This README
2. `docs/data/identity-migration-design.md`
3. `docs/tickets/BE-IDN-001.md` (then next unblocked ticket)
4. `pnpm agent:contract-slice --tag Auth`
5. Relevant blueprint section via `docs/ai/blueprint-index/05-identity-auth.md`
