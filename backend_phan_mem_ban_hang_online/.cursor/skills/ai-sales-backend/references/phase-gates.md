# Phase Gates

## P0 — Planning baseline (complete)

Exit criteria: ADRs 001–010, contract skeletons, permission/error matrices, threat model seed, epic board.

Evidence: `docs/p0/P0_CHECKLIST.md`

Do not start domain modules until P0 exit gate is met.

## P1 — Foundation (in progress)

Key tasks: BE-FND-001 through BE-FND-016.

Exit criteria:

- Monorepo with `modules/` scaffold and boundary lint
- Local Docker stack running
- Config, database, migration framework
- Idempotency, outbox/inbox components
- Queue/scheduler skeleton
- Audit port
- Observability baseline
- CI verify pipeline green
- Walking skeleton end-to-end trace

Run `pnpm verify` before claiming any BE-FND-* task complete.

## P2+ — Domain modules

Each phase requires schema + RLS + APIs + security suite per blueprint §19.

Before starting a domain phase, confirm prerequisite foundation tasks are Done in `backend_doc/matrices/implementation_backlog.csv`.

## Verification commands

```bash
pnpm verify          # lint, typecheck, contracts, unit tests
pnpm verify:all      # + Python ai-service tests
pnpm agent:context BE-FND-016   # task-specific read set
```
