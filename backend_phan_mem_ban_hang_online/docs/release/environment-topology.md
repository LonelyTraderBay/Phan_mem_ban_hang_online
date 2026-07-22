# Environment, Topology, and Release Seed

## Environments

Aligned with the frontend spec's 5-tier model (spec FE §5.1) so both AI agents share one taxonomy —
this repo's environment list used to be a 4-tier model without `dev`/`pilot`; resolved by adopting
the frontend's more detailed model as canonical for both repos (see
`docs/collaboration/SIGNOFF_TRACKER.md`'s "Environment/infrastructure" section for why this was
safe to resolve without a human decision: pure taxonomy, no business/security risk).

- `local`: Docker Compose PostgreSQL, Redis, object emulator, OTel collector. Individual dev/agent
  workstation only.
- `ci`: ephemeral PostgreSQL/Redis spun up per pipeline run for contract/type/test/security gates —
  not a standing environment, torn down after each run. Sits inside the `dev` tier below in terms
  of purpose (continuous integration), just without persistent state.
- `dev`: continuous-integration environment, auto-deployed from `main`, synthetic data only. Not
  provisioned yet (see `docs/release/fe-integration-environment.md` for current status).
- `staging`: production-like managed dependencies, immutable image promotion target, anonymized/
  synthetic data, used for UAT/E2E/perf. Not provisioned yet.
- `pilot`: real tenant(s), limited real data, feature-flagged + canary rollout — the step between
  staging and full production per the capacity/SLO baseline's "pilot minimum proof" targets
  (`docs/p0/capacity-slo-cost-assumptions.md`). Not provisioned yet.
- `production`: same image digest promoted from staging after go/no-go approval (Human Owner only —
  see `docs/collaboration/SIGNOFF_TRACKER.md`).

## Release Rules

- Build once, promote the same immutable image digest.
- Do not use container tag `latest`.
- Apply expand/contract migrations for risky changes.
- Rollback code by image digest; do not roll back by destructive schema edits.
- High-risk features require scoped feature flags and rollback owners.
