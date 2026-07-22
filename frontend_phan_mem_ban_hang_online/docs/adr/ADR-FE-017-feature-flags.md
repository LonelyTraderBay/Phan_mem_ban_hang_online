# ADR-FE-017: Feature flags

**Status:** Accepted

## Context

Rolling out risky features (AI Copilot) needs a kill switch and controlled rollout without a
redeploy, and the flag surface should be typed so a feature can't reference a flag key that
doesn't exist.

## Decision

Feature flags are typed, bootstrapped from the server (part of the session-bootstrap payload,
spec 9.3's `feature_flags` map), and default off.

## Consequences

- `contracts/feature-flags.yaml` is frontend-owned (not synced from backend — no backend
  feature-flag source exists yet), hand-maintained, and generates a per-app typed
  `FeatureFlagKey`/`FeatureFlagKeyFor<App>` union via `tooling/scripts/generate-feature-flags.mjs`
  — confirmed at scaffold time that `super-admin` correctly has no flag keys in its type space
  today, since the one existing flag (`ai_copilot`) is scoped to `web-admin`/`windows-client` only.
- `useFeatureFlag` falls back to `{ enabled: false }` if the server payload omits a flag the
  client's registry knows about — safe-default, matching the permission registry's equivalent
  behavior (ADR-FE-011's `usePermission`).
- `reportFeatureFlagMismatch` tracks drift between the client's known flag keys and what the
  server bootstrap actually sent, in either direction, rather than failing silently.
