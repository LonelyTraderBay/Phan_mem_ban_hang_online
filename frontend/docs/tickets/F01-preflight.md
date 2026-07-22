# F01 — Frontend ticket preflights (FE-F01-001 … FE-F01-006)

**Status:** READY-MOCK implementation landed (FE-F01-001…006) — 2026-07-22; design-specs READY-MOCK (HO 2026-07-21); F01 P0 contracts Closed including GAP-009 OIDC  
**Author:** Frontend AI Agent (preflight sync 2026-07-21)  
**Date:** 2026-07-21  
**Auth:** ADR-FE-013 OIDC/BFF HttpOnly cookie — **locked**. Email/password is **not** the Web Admin primary path.

Canonical gate: `backend/docs/readiness/ENTERPRISE_DOC_GATE.md` (sibling). Permission keys: only
`contracts/permissions/permission-matrix.yaml` — **`role.manage`**, never `role.write`.

---

## Definition of Ready (shared checklist)

Per ticket below must satisfy before implementation starts:

- [x] Design-spec(s) for touched screens READY-MOCK (HO approved 2026-07-21)
- [x] Auth/bootstrap OpenAPI frozen (SessionBootstrap, AuthResponse, MFA, CSRF, OIDC start/callback)
- [x] F01 error codes in `contracts/errors/error-catalog.yaml` (re-sync after BE GAP-009)
- [x] Permission keys confirmed in matrix (F01 slice)
- [x] MSW scenarios for OIDC + refresh chain (FE-F01-001/002; contracts already synced)
- [x] No invented permission or error codes in FE

---

## FE-F01-001 — Auth bootstrap and guards

| Item | Mapping |
|---|---|
| Screens / hooks | App shell guards; `packages/auth` state machine, `bootstrapSession`, refresh single-flight, cross-tab logout, safe return URL — **no dedicated design-spec screen** (callback N/A). Touches post-login redirect used by `/login`. |
| Design-specs | Indirect: `login.md`; architecture `docs/architecture/auth-sequence.md` |
| OpenAPI ops | `getCurrentContext` `GET /me`; `refreshSession` `POST /auth/refresh`; `logout` `POST /auth/logout`; `switchTenant` `POST /auth/switch-tenant` |
| Permissions | session gate; action gates use session `permissions[]` strings |
| Errors | `AUTH_TOKEN_EXPIRED`, `AUTH_REFRESH_REUSED`, `AUTH_SESSION_REVOKED`, `TENANT_CONTEXT_INVALID`, `TENANT_INACTIVE`, `MEMBERSHIP_INACTIVE`, `INSUFFICIENT_PERMISSION`, `CSRF_TOKEN_INVALID` — **do not refresh on 403** |
| MSW | 200 SessionBootstrap; 401 then refresh 200 + retry; refresh reused → logged out; 403 never triggers refresh; switch-tenant returns SessionBootstrap then client may still re-GET `/me` |
| Blockers | None — contracts synced; implement READY-MOCK |

**DoR:** Unblocked for MSW READY-MOCK.

---

## FE-F01-002 — Login / 2FA / recovery

| Item | Mapping |
|---|---|
| Screens | `/login`, `/2fa`, `/forgot-password`, `/reset-password` |
| Design-specs | `login.md`, `mfa-challenge.md`, `forgot-password.md`, `reset-password.md` |
| OpenAPI ops | **Primary:** `startOidcLogin` `GET /auth/oidc/start`; callback handled by BFF `completeOidcLogin` then app `/auth/callback` + `GET /me`. **MFA:** `verifyMfa`. **Local-credential only:** password forgot/reset. **Do not** use deprecated `POST /auth/login` for Web Admin. |
| Permissions | public |
| Errors | `AUTH_OIDC_*`, `AUTH_MFA_*`, `RATE_LIMITED`, `VALIDATION_FAILED`, `TENANT_INACTIVE`; map expired session to `AUTH_TOKEN_EXPIRED` |
| MSW | IdP start → simulated callback → bootstrap; MFA required → verify success/fail; rate limit 429; forgot always 200 enumeration-safe |
| Blockers | None — add MSW OIDC handlers with FE-F01-002 |

**DoR:** Unblocked for IdP-primary READY-MOCK. Credential form on login remains **disabled / out of scope**.

---

## FE-F01-003 — Invite acceptance

| Item | Mapping |
|---|---|
| Screens | `/accept-invite` |
| Design-specs | `accept-invite.md` |
| OpenAPI ops | `acceptInvitation` (`AcceptInvitationRequest`); then bootstrap `GET /me` |
| Permissions | public → then authenticated member |
| Errors | `INVITATION_TOKEN_INVALID`, `INVITE_EXPIRED`, `INVITE_REVOKED`, `INVITE_ALREADY_ACCEPTED` |
| MSW | Valid accept → session; invalid token; already used; tenant inactive |
| Blockers | Prefer OIDC bind-on-invite when IdP configured |

---

## FE-F01-004 — User management

| Item | Mapping |
|---|---|
| Screens | `/settings/users` |
| Design-specs | `settings-users.md` |
| OpenAPI ops | `GET/POST /members`, invitations list/create/resend, activate/suspend/revoke member |
| Permissions | Route: `member.read`. Actions: `member.invite`, `member.update`, `member.revoke`. Roles picker needs `role.read` |
| Errors | `VALIDATION_FAILED`, `INSUFFICIENT_PERMISSION`, `IDEMPOTENCY_*`, `RESOURCE_VERSION_MISMATCH`, `USER_LAST_OWNER` |
| MSW | Empty list; invite success; forbidden; last-owner reject; suspend/revoke confirm |
| Blockers | Some member/role bodies may still be Generic — freeze before READY-INTEGRATION; READY-MOCK may use typed fixtures |

---

## FE-F01-005 — Role editor

| Item | Mapping |
|---|---|
| Screens | `/settings/roles` |
| Design-specs | `settings-roles.md` |
| OpenAPI ops | `GET/POST /roles`, `GET/PATCH/DELETE /roles/{role_id}`, member role assign if in scope |
| Permissions | View: `role.read`. Mutate: **`role.manage`** (never `role.write`) |
| Errors | `RESOURCE_VERSION_MISMATCH`, `INSUFFICIENT_PERMISSION`, `ROLE_WOULD_REMOVE_LAST_ADMIN` |
| MSW | List roles; save conflict 412; forbidden without role.manage |
| Blockers | Role mutate schemas may still need freeze before READY-INTEGRATION |

---

## FE-F01-006 — Device sessions

| Item | Mapping |
|---|---|
| Screens | `/settings/devices` |
| Design-specs | `settings-devices.md` |
| OpenAPI ops | devices/sessions list+revoke, `POST /auth/logout` |
| Permissions | authenticated only — **no** `device.*` keys |
| Errors | `AUTH_SESSION_REVOKED`, `RESOURCE_NOT_FOUND`, `RATE_LIMITED`, `DEVICE_ALREADY_REVOKED` |
| MSW | List current + others; revoke other; revoke current → logout; double-revoke |
| Blockers | None for READY-MOCK |

---

## Cross-cutting

- Contracts synced post GAP-009 / Identity (`contracts/BACKEND_REF.lock` matches BE HEAD). Re-sync only when BE OpenAPI changes again.
- Non-F01 permission drift: see `backend/docs/collaboration/gap-003-remaining-ledger.md` — do not invent keys.
- Staging/dev API: waived (MSW) until Identity E2E — `ENTERPRISE_DOC_GATE.md`.
