# Test Strategy

Synthesizes the test infrastructure that already runs for real in this repo (per
`ARTEFACT_STATUS.md`: "F00's test infrastructure is real and working, but a written strategy doc
synthesizing it doesn't exist yet"). This describes **what exists today**, not an aspirational
target — update it as each layer matures, don't pre-write coverage for tests that don't exist yet.

## Layers, from fastest/cheapest to slowest/most expensive

| Layer | Tool | Where | What it proves today |
|---|---|---|---|
| Unit/component | Vitest | `packages/*/src/**/*.test.ts`, `apps/*/src/**/*.test.ts(x)` | Pure logic and component behavior in isolation |
| Contract/mock | MSW (`@ai-sales/test-utils`) | Any Vitest test importing `msw/server` | API layer behaves against contract-shaped responses, without a real backend |
| Static/type | ESLint + `tsc` | `pnpm lint`, `pnpm typecheck` | Import boundaries (spec §4.3), no-explicit-any, consistent-type-imports, no runtime `enum` |
| Accessibility | Storybook + axe addon | `packages/ui` stories | Keyboard/a11y per story — **automated runner currently broken** (see gap below), interactive panel still works |
| E2E smoke | Playwright | `apps/web-admin/e2e/smoke.spec.ts`, `playwright.config.ts` | One real browser flow through the actual running app, chromium + msedge |
| Bundle budget | `tooling/scripts/check-bundle-budget.mjs` | CI step 13 | Shipped JS size doesn't silently balloon |
| SAST | CodeQL | `.github/workflows/pr.yml` `sast` job | Static security scan, javascript-typescript |

## What each layer is (and isn't) responsible for

- **Unit/component tests** own business logic inside a package (money math in `@ai-sales/domain`,
  permission resolution in `@ai-sales/permissions`, form validation in `@ai-sales/forms`). They do
  not own cross-package integration — that's what MSW-backed tests and E2E are for.
- **MSW-backed tests** own "does this feature call the right endpoint and handle the response
  shape correctly" without needing a real backend. Per `packages/test-utils/README.md`, ~95% of
  generated fixtures are still the generic envelope shape (`GenericListResponse`/
  `GenericDataResponse`) because that's honestly what the backend contract currently returns for
  most operations — tests relying on a specific real business schema (e.g. session bootstrap) need
  a hand-written override, not an assumption that the generated fixture is realistic yet.
- **E2E smoke** owns "does the app boot and render the shell for real" — currently one spec
  (`smoke.spec.ts`). This is intentionally minimal at F00; it is not yet a regression suite for
  business flows because those flows (F01+) don't exist yet. Each feature module should add its own
  E2E spec when it ships, not retrofit smoke.spec.ts to cover everything.
- **Storybook a11y** owns component-level accessibility (spec §7.4 baseline) at the point of
  authoring a component, before it's wired into any feature — cheaper to catch than in E2E.

## Coverage thresholds — deliberately modest right now

Per-package `vitest.config.ts` coverage thresholds start at 20% (see
`docs/runbooks/ci-troubleshooting.md`'s "Coverage threshold failure" entry) because F00 is
scaffold code with intentionally thin logic so far. **Raise a package's threshold when its logic
actually grows** — don't lower a threshold to make a failing PR pass; either write the missing test
or confirm (in the PR/ticket notes) that the threshold is still appropriate for what that package
does.

## Known gaps (tracked, not hidden)

| Gap | Detail | Where tracked |
|---|---|---|
| `test-storybook` a11y CLI runner fails (`__test is not defined`) | Storybook 8.4/Vite version interaction; `continue-on-error` in CI | `packages/ui/README.md`, `docs/runbooks/ci-troubleshooting.md` |
| Dependency audit is advisory only | `pnpm audit --audit-level=high` is `continue-on-error` until a license-policy tool is picked | `.github/workflows/pr.yml` step 5 |
| No performance/load test layer yet | `docs/quality/performance-plan.md` is explicitly gated on Human Owner sign-off (spec §17.1's "Performance/Product approval" — collapses to Human Owner, see `backend/docs/domain/glossary.md`'s roles table) — not written unilaterally | `ARTEFACT_STATUS.md` |
| No business-flow E2E yet | Only the boot smoke spec exists; real flows arrive per F0x module | This file, `apps/web-admin/CLAUDE.md` |

## When a new feature module (F01+) ships, it should add

1. Unit tests for its `domain`/`schemas` logic (pure functions, Zod schemas).
2. MSW handler overrides for any operation whose real response shape isn't the generic stub yet.
3. At least one Playwright spec for its critical happy-path flow, following the pattern in
   `apps/web-admin/e2e/smoke.spec.ts`.
4. Storybook stories for any new `packages/ui` component it introduces, so the (currently
   interactive-only) a11y check has something to run against once the CLI runner gap is fixed.
5. Negative-permission and negative-tenant-isolation cases wherever the feature reads/writes data
   gated by `PermissionGate` — mirroring the backend's own tenant isolation test suite discipline
   (Blueprint §6.6), even though FE tests can't verify RLS itself, they should verify the UI
   degrades correctly (403 render, no partial feature) when the API returns a permission denial.
