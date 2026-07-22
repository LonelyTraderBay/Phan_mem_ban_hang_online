# P0 Readiness Runbook

1. Validate contracts with `pnpm contracts:validate`.
2. Validate Node toolchain with `pnpm check:node`.
3. Run TypeScript gates with `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
4. Run AI service tests with `python -m pytest apps/ai-service/tests` after installing `apps/ai-service/requirements-dev.txt`.
5. Review `docs/p0/P0_CHECKLIST.md` before opening P1 foundation work.
