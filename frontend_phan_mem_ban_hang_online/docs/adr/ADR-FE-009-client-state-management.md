# ADR-FE-009: Client state management

**Status:** Accepted

## Context

Some state is genuinely client-only (session/connection view state, UI preferences) and doesn't
belong in TanStack Query (ADR-FE-008) or React Router search params (spec 13.1's state
classification table).

## Decision

Zustand, scoped narrowly to session/connection/UI-preference state — never a dumping ground for
server data.

## Consequences

- `packages/auth`'s `createSessionStore` is a Zustand store wrapping the auth state machine
  (`unknown → bootstrapping → anonymous → authenticating → partially_authenticated →
  authenticated → refreshing → expired → revoked → signing_out → anonymous`, spec 9.4) — every
  transition is validated against an explicit transition table (`transitionAuthStatus`), which
  throws on an illegal transition rather than silently accepting it.
- Each app (`web-admin`, `super-admin`, `windows-client`) creates its own store instance — no
  shared Zustand store across apps, consistent with ADR-FE-004's session-isolation requirement.
- `packages/realtime`'s connection-status store deliberately uses a smaller hand-rolled pub-sub
  (`createConnectionStatusStore` + `useSyncExternalStore`) rather than Zustand, since it only
  needs single-value state with no actions — avoids pulling Zustand into a package that would
  otherwise stay dependency-light.
