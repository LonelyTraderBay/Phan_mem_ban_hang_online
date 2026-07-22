---
name: pr-ci-check
description: Run the local-runnable equivalent of .github/workflows/pr.yml's full 16-step CI gate before opening a PR, and report a pass/fail checklist. Use before opening a PR, or when asked "is this ready for a PR", "will CI pass", or "run the full check" — pnpm verify alone only covers steps 6/8/9/10/11 of the 16.
---

# PR CI check

`pnpm verify` (`check:node && contracts:validate && lint && typecheck && test && build`) is a
shortcut, not the real gate — it skips 6 of the 16 steps CI actually runs. This skill runs every
step that can run locally, in the same order, and tells you honestly which ones can't be verified
outside CI.

## Steps, in CI order

Run each and record pass/fail. Stop and report immediately if an early step fails — don't burn
time on `test:e2e` if `lint` is already red.

| # | CI step | Local command | Notes |
|---|---|---|---|
| 3 | Install (frozen lockfile) | `pnpm install --frozen-lockfile` | Fails if `package.json` changed without updating `pnpm-lock.yaml` |
| 4 | Secret scan | — | **CI-only** unless `gitleaks` CLI is installed locally; don't skip mentioning this |
| 5 | Dependency audit | `pnpm audit --audit-level=high` | Advisory — CI runs it `continue-on-error` too, report but don't block on it |
| 6 | Validate contracts | `pnpm contracts:validate` | |
| 7 | Codegen drift check | `pnpm codegen:check-clean` | Re-runs `contracts:sync` + `api-generated`'s codegen — needs the sibling `backend/` checkout to exist next to `frontend/` (see `.claude/rules/contracts-codegen.md`'s worktree note) |
| 8 | Lint | `pnpm lint` | |
| 9 | Typecheck | `pnpm typecheck` | |
| 10 | Test + coverage | `pnpm test:coverage` | |
| 11 | Build | `pnpm build` | |
| 12 | Storybook a11y | — | **Known-broken gap** (`__test is not defined`, `continue-on-error` in CI) — don't try to make this pass; instead run the `a11y-gap-reviewer` subagent against any changed component |
| 13 | Bundle budget | `pnpm bundle:budget` | If it fails, investigate what dependency/asset grew (`docs/runbooks/ci-troubleshooting.md`) rather than raising the budget number |
| 14 | E2E smoke | `pnpm exec playwright install chromium` (once) then `pnpm --filter @ai-sales/web-admin run test:e2e` | Only covers `web-admin`; other apps have no e2e suite yet |
| 16 | SAST (CodeQL) | — | **CI-only** — no local equivalent; rely on the `fe-architecture-reviewer`/`pii-telemetry-auditor` subagents to catch what a security-focused review would flag before this runs remotely |

(Steps 1, 2, 15 are checkout/runner-setup/artifact-upload — nothing to run locally.)

## Output

A checklist in the same order as the table: ✅/❌/⚠️(CI-only, not checked) per step, plus for any
❌ a one-line pointer to `docs/runbooks/ci-troubleshooting.md`'s matching section if one exists.
End with a single verdict: **ready to open a PR** (only CI-only/known-gap items unchecked) or
**not ready** (name the failing step).
