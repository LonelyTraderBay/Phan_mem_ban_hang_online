# @ai-sales/auth

Session bootstrap, auth state machine, refresh, cross-tab sync, tenant switching, route guards
(spec 9.x, FE-F01 foundation).

- Every state-machine transition (`authStateMachine.ts`) must ship with UI and a test — illegal
  transitions throw `IllegalAuthTransitionError` rather than silently no-opping.
- Refresh is single-flight: concurrent 401s coalesce into one refresh request (`refresh.ts`).
  **Must never** be invoked for a 403 (spec 9.5 — a 403 is an authorization decision, not an
  expired session).
- Permissions in the session-bootstrap payload are always specific permission strings, never a
  single role name (spec 9.3) — see `@ai-sales/permissions`.
- Tenant switching (`tenantSwitch.ts`, spec 9.8) never just swaps `tenant_id` client-side — it
  runs a full re-bootstrap.
- Each app creates its own `sessionStore` instance — sessions are never shared across apps
  (ADR-FE-004; see the per-app CLAUDE.md files).
- No README; these constraints live as inline comments in `authStateMachine.ts`, `refresh.ts`,
  `tenantSwitch.ts`, `sessionStore.ts`, `schemas.ts`, `crossTab.ts`, `bootstrap.ts`.
