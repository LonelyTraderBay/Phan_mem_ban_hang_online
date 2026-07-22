# ADR-FE-002: Web framework

**Status:** Accepted

## Context

Web Admin and Super Admin are internal, authenticated, permission-gated tools — no public SEO
surface, no need for server-side rendering. The desktop client (ADR-FE-003) also renders this
same React tree inside a WebView, so the web framework choice must not assume a Node server.

## Decision

React 19.x + TypeScript 6.x strict + Vite, built as a client-only SPA (no SSR/SEO).

## Consequences

- No server runtime to operate/secure for the web apps — auth is via BFF cookie (ADR-FE-013),
  not a Node session server.
- Confirmed during F00 scaffolding: TypeScript 6.0.3 installs and typechecks cleanly against
  React 19/Vite 6/Vitest 4/Storybook 8.4 — no version-compatibility blocker found (this was an
  open question at ADR-writing time; now resolved).
- `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` (mirroring backend's strictness) surface
  real bugs at compile time (e.g. a fetch-response JSON-parse failure that would otherwise throw
  unhandled — caught and fixed in `packages/api-client` during scaffolding) but require
  discipline: optional object literals must build properties conditionally rather than assigning
  `undefined` directly.
