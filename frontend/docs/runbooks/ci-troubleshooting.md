# CI troubleshooting

Common failure modes in `.github/workflows/pr.yml` and how to resolve them.

## `pnpm install --frozen-lockfile` fails

The lockfile is out of date with `package.json` changes. Run `pnpm install` locally (without
`--frozen-lockfile`) and commit the updated `pnpm-lock.yaml`.

## `codegen:check-clean` fails ("regenerating contracts/generated code produced a diff")

Someone changed a package.json contracts dependency, or the backend's OpenAPI/AsyncAPI/CSV
contracts changed upstream without a corresponding frontend sync. Run locally:

```sh
pnpm contracts:sync && pnpm codegen:api
```

then commit the resulting diff under `contracts/`, `packages/api-generated/src/generated/`,
`packages/api-client/src/generated/`, `packages/permissions/src/generated/`.

## ESLint boundary violations (`no-restricted-imports` errors)

These enforce spec section 4.3's layering rules (e.g. `packages/ui` importing `@ai-sales/auth`,
or a feature deep-importing another feature's internals). The fix is almost always to move the
import to the correct layer, not to suppress the rule — see the specific package's README for the
documented pattern (e.g. `packages/ui/README.md`'s prop-driven gate pattern).

## Coverage threshold failure

Check which package's `vitest.config.ts` failed — thresholds are deliberately modest (20% for
most packages, spec: "threshold khởi điểm khiêm tốn" since F00 is scaffold code) but do fail if a
new file with zero tests is added. Either add a test or, if the file is genuinely
integration-only (e.g. a thin app-level wiring file), confirm the threshold is still appropriate
for that package rather than papering over a real drop in coverage.

## `test-storybook` (Storybook a11y test runner) fails with `__test is not defined`

Known gap, not a new regression — see `packages/ui/README.md`. This step is `continue-on-error`
in CI for exactly this reason; don't spend time re-debugging it without first checking whether
`@storybook/test-runner`/`storybook`/`@storybook/react-vite` versions have since been updated to
resolve it.

## Playwright e2e fails with "browser not found"

The CI job runs `pnpm exec playwright install --with-deps chromium msedge` before the e2e step —
if this step was skipped or cached incorrectly, browsers won't be present. Locally, run the same
command once.

## Bundle budget failure

`tooling/scripts/check-bundle-budget.mjs` — check which app's `dist/` grew past the fixed 2MB
provisional budget (spec 17.1 says the real target needs Performance/Product sign-off; this is a
starting gate). Investigate what dependency/asset grew before just raising the number.
