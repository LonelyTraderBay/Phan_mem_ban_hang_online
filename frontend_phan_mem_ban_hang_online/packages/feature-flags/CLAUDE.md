# @ai-sales/feature-flags

Typed feature-flag registry and evaluation hook, generated from `contracts/feature-flags.yaml`
(ADR-FE-017, FE-F00-007).

- Flags are always server-bootstrapped — never evaluated client-side from scratch (ADR-FE-017).
- **Fail closed**, same as permissions: if the server payload omits a known flag, it falls back to
  `{ enabled: false }` (default-off) rather than assuming enabled.
- Drift is tracked both directions: keys missing from the server payload, and unknown keys the
  server sends (`telemetryMismatch.ts`, FE-F00-007 step 5).
- `src/generated/featureFlagKeys.ts` is generated from `contracts/feature-flags.yaml` via
  `node tooling/scripts/generate-feature-flags.mjs` (this package's own `codegen` script) — never
  hand-edit it. Currently defines exactly one flag: `"ai_copilot"`.
- No README; constraints live as inline comments in `registry.tsx` and `telemetryMismatch.ts`.
