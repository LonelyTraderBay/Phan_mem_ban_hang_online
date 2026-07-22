# ADR-FE-004: Super Admin deployment

**Status:** Accepted

## Context

Super Admin (Operations) can act across tenants — support elevation, feature-flag overrides,
emergency actions (spec section 10.5, module F11). A bug or compromised session in this surface
has a much larger blast radius than a single-tenant Web Admin session.

## Decision

Super Admin is a fully separate app, origin, and deployment from Web Admin — its own build
(`apps/super-admin`), its own session/telemetry context, and (at deploy time) its own origin.

## Consequences

- No shared session cookie or React context between `web-admin` and `super-admin` — confirmed at
  the ESLint layer (`apps/*/src/**` boundary rule) and by grep sanity check during F00 scaffolding
  (zero cross-app imports).
- Super Admin's `contracts/openapi/ops-api.yaml` is generated as a genuinely separate file (split
  by the `Operations` tag / `/super-admin/*` path prefix from the backend's single OpenAPI file),
  not a subset view of the tenant API — so its generated types cannot even reference tenant-only
  operations.
- At local dev time, "separate origin" is approximated with a different port (5174 vs 5173) since
  a single dev machine can't easily have two real origins — document this approximation in the
  local-setup runbook so nobody mistakes it for the real deployment topology.
- Super Admin currently has no feature flags scoped to it (`contracts/feature-flags.yaml`'s only
  flag, `ai_copilot`, targets `web-admin`/`windows-client`) — its typed flag-key union is
  correctly empty rather than inheriting the other apps' flags.
