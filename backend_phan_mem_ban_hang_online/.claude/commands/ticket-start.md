---
description: Kick off a BE-* ticket — load its context, the ticket template, and draft the Preflight section
argument-hint: <TASK_ID>
---

Ticket: $ARGUMENTS

## Context

!`pnpm agent:context $ARGUMENTS`

## Steps

1. Read the context output above, `backend_doc/START_HERE.md`, and the relevant blueprint
   section it points you to (via `docs/ai/blueprint-index/` — never the full blueprint).
2. Check whether `docs/tickets/$ARGUMENTS.md` already exists. If not, create it from
   `backend_doc/templates/backend_ticket_template.md`.
3. Draft the **Preflight** section per the ticket workflow in
   `.cursor/rules/00-global-invariants.mdc` (step 1): domain, phase, contracts, tenant class,
   permissions, idempotency, audit, events, telemetry, rollback.
4. Stop after Preflight and summarize open questions. Do not start contract work or
   implementation yet — Preflight comes first.
