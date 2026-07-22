# @ai-sales/ui

Shared design-system components (spec 7.2). Boundary rule (spec 4.3): this package may only
import `@ai-sales/design-tokens` and `@ai-sales/i18n` (type-only) — never `api-client`, `auth`,
`realtime`, or app/feature code.

## Gate components receive their decision as a prop

`PermissionGate` and `FeatureFlagGate` are listed in spec 7.2's shared component catalog, which
appears to conflict with the import-boundary rule above (gating needs permission/flag data, which
lives in `@ai-sales/permissions`/`@ai-sales/feature-flags`, both of which depend on `@ai-sales/auth`).

**Resolution**: the *decision* (`usePermission(key)` / `useFeatureFlag(key)`) is computed
upstream by the calling feature, using the headless hooks from `@ai-sales/permissions` /
`@ai-sales/feature-flags`. The result (`allowed`/`enabled`, a boolean) is passed down as a prop:

```tsx
<PermissionGate allowed={usePermission("order.create")}>
  <CreateOrderButton />
</PermissionGate>
```

`packages/ui`'s `PermissionGate.tsx` never imports `@ai-sales/auth` or `@ai-sales/permissions` —
it stays a pure, prop-driven, presentational component.

## No hard-coded colors

Every component consumes CSS custom properties from `@ai-sales/design-tokens` (via
`buildCssVariables()`, injected once at app/Storybook bootstrap) — never a literal hex value in a
component or story (spec 7.1).

## Known gap: `test-storybook` CLI

`@storybook/test-runner@0.20.1`'s peer deps claim Storybook 8.2-8.6 support, but running
`pnpm test:storybook` against this repo's `storybook@8.4.7` + `@storybook/react-vite` setup
fails every story with `ReferenceError: __test is not defined` inside the preview iframe — the
test-runner's injected client script isn't wiring up correctly for this Vite-based preview build.
Storybook itself builds and serves correctly (`pnpm build` / `pnpm storybook` both work, and the
`@storybook/addon-a11y` panel works interactively in the Storybook UI); only the automated CLI
runner is affected. Needs further investigation (likely a `.storybook/test-runner.ts` config or a
different test-runner/Storybook version pairing) before CI can depend on it — flagged here rather
than silently wired into CI as if it were green.

## Anti-patterns

- Do not import `@ai-sales/api-client`, `@ai-sales/auth`, or anything under `apps/*/src/features`
  from this package.
- Do not encode status with color alone — `StatusBadge` always renders a text label alongside
  the color (spec 7.1).
- Do not add a new component without a Storybook story covering its default/edge/error states.
