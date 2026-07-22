# BE-IDN security / contract test matrix

Companion to tickets `BE-IDN-001` … `BE-IDN-015`. Each row is a required test category; owning ticket must land evidence before status → done.

| ID | Area | Happy path | Negative / isolation | Idempotency / concurrency | Contract |
|---|---|---|---|---|---|
| BE-IDN-001 | Schema + RLS | Migrate fresh; seed permissions/system roles | Cross-tenant/cross-user session deny; nullable-tenant session policy | N/A | Tables match data-dictionary + migration design |
| BE-IDN-002 | Tenant provision | Create tenant + owner invite + default roles | Duplicate tenant code; inactive plan | Idempotent provision key | OpenAPI tenant create 2xx schema |
| BE-IDN-003 | OIDC BFF login | start → IdP → callback → session cookies → `GET /me` SessionBootstrap | Bad/missing state → `AUTH_OIDC_STATE_INVALID`; exchange fail → `AUTH_OIDC_EXCHANGE_FAILED`; IdP error → `AUTH_OIDC_PROVIDER_ERROR`; rate limit | Callback code single-use; CSRF on later cookie mutations (GAP-006); no tokens in Web JSON | startOidcLogin / completeOidcLogin; AuthResponse on refresh |
| BE-IDN-004 | Access JWT | Valid audience/issuer/exp | Wrong audience; rotated key reject; expired → `AUTH_TOKEN_EXPIRED` | Key rotation dual-accept window | N/A (middleware) |
| BE-IDN-005 | Refresh rotation | Rotate → new refresh; old revoked | Reuse detected → family revoke + `AUTH_REFRESH_REUSED` | Concurrent refresh race | AuthResponse |
| BE-IDN-006 | Logout / revoke | Logout clears session; device revoke | Already revoked → `DEVICE_ALREADY_REVOKED`; other user 404 | Idempotent revoke | Session events / SSE hook |
| BE-IDN-007 | Password reset | Single-use token succeeds | Reuse / expired token | One success only | Forgot/reset request schemas |
| BE-IDN-008 | MFA TOTP | Enroll + verify → session | Bad code → `AUTH_MFA_INVALID`; step-up | Challenge single-use | MFA verify body (GAP-008) + AuthResponse |
| BE-IDN-009 | Switch tenant | Switch → new context; `/me` matches | Membership inactive → `MEMBERSHIP_INACTIVE`; wrong tenant → `TENANT_CONTEXT_INVALID` | — | SessionBootstrap on `/me` |
| BE-IDN-010 | Invites | Invite + accept | `INVITE_EXPIRED` / `INVITE_REVOKED` / `INVITE_ALREADY_ACCEPTED`; umbrella `INVITATION_TOKEN_INVALID` only when reason unknown | Accept once | AcceptInvitationRequest + AuthResponse |
| BE-IDN-011 | Roles | Create/update role + permissions | `role.manage` deny; last admin → `ROLE_WOULD_REMOVE_LAST_ADMIN`; ETag → `RESOURCE_VERSION_MISMATCH` (alias ROLE_VERSION_CONFLICT) | Concurrent role edit | Role schemas |
| BE-IDN-012 | Field auth | Cost field hidden without permission | IDOR on field | — | Response shape omits fields |
| BE-IDN-013 | Audit list/export | List with redaction | Permission deny; PII redacted in export | Export job idempotency | Audit list schema |
| BE-IDN-014 | Support grant | Grant + scoped access | Expired grant; over-scope deny | — | Support grant API |
| BE-IDN-015 | Security suite | Aggregate green | Tenant isolation + permission negative suite for all F01 endpoints | Refresh reuse + invite accept races | Contract slice Auth/Members/Roles |

## Mapping notes

- Spec label `AUTH_SESSION_EXPIRED` → catalog `AUTH_TOKEN_EXPIRED`
- Spec label `ROLE_VERSION_CONFLICT` → catalog `RESOURCE_VERSION_MISMATCH`
- `x-permission: authenticated` is a session gate, not a `permissions[]` entry (`gap-003-f01-slice.md`)
