---
description: Scaffold a bounded-context module and wire it to the audit walking-skeleton pattern (ports, tenant transaction, outbox, permission check, tests)
argument-hint: <module-name>
---

Module: $ARGUMENTS

## Scaffold

!`pnpm scaffold:module $ARGUMENTS`

## Reference pattern — read before writing anything

`modules/audit/` is the only fully-wired module in this repo. Read it end to end before
touching `modules/$ARGUMENTS/`:

- `modules/audit/src/application/ports/*.port.ts` — ports the domain/application layer depends
  on
- `modules/audit/src/infrastructure/persistence/*.ts` — Kysely adapters,
  `withTenantTransaction` (sets `app.tenant_id`/`app.actor_id`/`app.correlation_id` session vars
  for RLS)
- `modules/audit/src/presentation/http/*.controller.ts` — factory-function controller pattern
  (`createXController(options)`), `requirePermission` usage
- `modules/audit/src/index.ts` — barrel exports public surface only

**Known gap — do not copy it**: `modules/audit` currently has zero test files. Don't repeat
that here; see Tests below.

## What every new module must have (this repo's own non-negotiables)

Per `.cursor/rules/00-global-invariants.mdc` and `backend_doc/templates/backend_ticket_template.md`:

1. Contract-first: slice the relevant OpenAPI tag with `pnpm agent:contract-slice --tag <Tag>`
   before writing handlers.
2. Tenant isolation via `withTenantTransaction` from `@ai-sales/database` — never a bare
   Postgres client.
3. Permission checks via `requirePermission` from `@ai-sales/security` at the presentation
   edge, not scattered through domain logic.
4. Domain layer imports nothing from NestJS/DB/queue/HTTP/provider SDKs — enforced by
   `no-restricted-imports` in `eslint.config.mjs` for `modules/**/domain/**`.
5. Cross-module side effects go through the outbox (`@ai-sales/outbox`). That package is
   currently interfaces-only with no real implementation — if this module needs a working
   outbox writer, flag it to the user rather than inventing one silently; `modules/audit`
   implements its own Postgres outbox writer directly as the only existing example.
6. Money as integer minor units if the module touches money.

## Tests — mandatory, this is the gap `modules/audit` leaves open

Write, at minimum:

- Tenant isolation test (cross-tenant read/write is rejected)
- Permission negative test (missing/insufficient permission is rejected)
- Idempotency/retry test if the module has mutating endpoints
- Contract test (response matches the sliced OpenAPI schema)

Reuse fixtures from `packages/test-utils/src/index.ts` (e.g. `createTestSecurityContext`)
instead of hand-rolling security context objects.

## After scaffolding

1. Add `@ai-sales/module-$ARGUMENTS` to the `resolve.alias` map in `vitest.config.ts` (see the
   existing `module-audit`/`module-identity` entries).
2. Run `pnpm verify` before considering the module ready for review.
3. Once there's a real diff, run the `invariant-reviewer` and (when a ticket doc exists)
   `ticket-completion-reviewer` subagents.
