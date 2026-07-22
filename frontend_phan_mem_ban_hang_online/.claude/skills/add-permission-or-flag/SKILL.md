---
name: add-permission-or-flag
description: Wire up a new permission check or feature flag end-to-end (contracts, codegen, gating hook, UI gate, mismatch telemetry). Use when asked to "gate this behind a permission", "add a feature flag", "check if the user can do X", or before using PermissionGate/FeatureFlagGate for something not already gated.
---

# Add a permission check or feature flag

These two look similar in the UI (`usePermission`/`useFeatureFlag` + a `Gate` component) but have
**opposite ownership** of their source contract — read the right half below, don't mix them up.
The `guard-generated-edit.mjs` PreToolUse hook enforces this distinction: it blocks hand-edits to
`contracts/permissions/**` but allows `contracts/feature-flags.yaml`.

## Permissions — backend-owned, frontend only consumes

`contracts/permissions/permission-matrix.yaml` is **synced from the backend** (spec 10.x) — the
frontend never adds a new permission key by hand-editing it.

1. Check whether the permission already exists: search `contracts/permissions/permission-matrix.yaml`
   and `packages/permissions/src/generated/permissionKeys.ts`'s `PermissionKey` union.
2. **If it doesn't exist**: this is a missing contract — raise a Contract Gap (spec §1.4), don't
   invent the permission string yourself. Once backend adds it and it's synced
   (`pnpm contracts:sync`), the generated `PermissionKey` union picks it up automatically.
3. **If it already exists**: wire it into UI —
   ```tsx
   const canCreateOrder = usePermission("order.create");
   <PermissionGate allowed={canCreateOrder}>
     <CreateOrderButton />
   </PermissionGate>
   ```
   Compute the decision with the hook in the feature/route component; pass the boolean down as a
   prop. Never import `@ai-sales/permissions` inside `packages/ui` itself (see
   `packages/ui/CLAUDE.md`).
4. Remember `usePermission` fails closed by design — an unrecognized/stale key resolves to denied,
   never allowed. Don't add a fallback that assumes "allowed" for a key you're not 100% sure exists
   in the matrix.
5. If the backend later 403s a call the client believed was permitted, that path should already go
   through `reportPermissionMismatch` (spec 10.4) — don't add a second, silent error-swallowing
   path around it.

## Feature flags — frontend-owned, hand-maintained

`contracts/feature-flags.yaml` is the one exception under `contracts/` — edit it directly.

1. Add the new key to `contracts/feature-flags.yaml`.
2. Regenerate the typed union:
   ```sh
   pnpm --filter @ai-sales/feature-flags run codegen
   ```
   This rewrites `packages/feature-flags/src/generated/featureFlagKeys.ts` (`FeatureFlagKey`, plus
   the per-app unions `FeatureFlagKeyForWebAdmin`/`FeatureFlagKeyForWindowsClient`) — never
   hand-edit that generated file.
3. Wire it into UI the same shape as permissions:
   ```tsx
   const { enabled } = useFeatureFlag("ai_copilot");
   <FeatureFlagGate enabled={enabled}>
     <CopilotPanel />
   </FeatureFlagGate>
   ```
4. Flags are always server-bootstrapped (ADR-FE-017) — never evaluate a flag client-side from a
   local constant. If the server payload omits the key, the registry already falls back to
   `{ enabled: false }` (default-off, fail-closed) — don't override that with a different default.
5. Drift (server sends an unknown key, or omits a known one) is already tracked via
   `telemetryMismatch.ts` (FE-F00-007 step 5) — no extra wiring needed for that part.

## After either path

Run `pnpm --filter <affected-package> run test` and, if the change touches a screen,
`pnpm --filter @ai-sales/web-admin run lint` (or the relevant app) to catch anything the boundary
rules would flag.
