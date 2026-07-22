# ADR-FE-001: Monorepo strategy

**Status:** Accepted

## Context

The frontend ships three deployables (Web Admin, Super Admin, Windows Client) sharing a large
surface of code (design system, API client, auth, permissions, realtime) that must stay in lock
step with a single, frequently-changing backend contract (spec section 3.1, 4).

## Decision

Use a pnpm workspace + Turborepo monorepo: one lockfile, shared packages under `packages/`,
affected-graph builds, and remote/local task caching.

## Consequences

- Contract changes (`pnpm contracts:sync`) propagate to every consumer in the same commit —
  no version-skew between apps and shared packages.
- `turbo.json`'s `dependsOn: ["^build"]` graph must stay accurate or downstream packages silently
  build against stale output.
- Confirmed during F00 scaffolding: `turbo` needs a real `pnpm` binary on `PATH` (not just the
  Windows `corepack pnpm.cmd` shim) to resolve `--filter`; document this in
  `docs/runbooks/local-setup.md`.
- Backend is a separate pnpm workspace (own lockfile) — the two are siblings, not one workspace,
  since they have no shared runtime code and different release cadences.
