---
name: agent-stack-router
description: Routes backend tasks to the correct on-demand skill. Use at session start or when unsure which discipline applies. Maps BE-* ticket prefixes and task types to skills in .cursor/skills/. Blueprint and pnpm agent:context always win.
---

# Agent Stack Router

## Prime directive

1. Blueprint + ADRs + frozen contracts override every skill.
2. Run `pnpm agent:context <TASK_ID>` before reading code.
3. Load only the skill matching the task — never all skills at once.

## Task → skill routing

| Task type | Skill | Also run |
|-----------|-------|----------|
| New/changed OpenAPI, module boundary, DTO | `api-and-interface-design` | `pnpm agent:contract-slice --tag <Tag>` |
| Auth, RLS, tenant, webhooks, PII | `security-and-hardening` | Blueprint §5–6 |
| Implement or fix behavior | `test-driven-development` | `pnpm verify` |
| Payment, order, idempotency, migration, irreversible | `doubt-driven-development` | TDD red step first |
| CI fail, flaky test, unexpected error | `debugging-and-error-recovery` | — |
| Cross-module refactor, unknown call chain | GitNexus MCP (`impact`, `context`, `query`) | Before bulk grep |
| Diff >100 LOC after implement | Ponytail review mindset | Check over-engineering |

## Exploration order (token savings)

1. `pnpm agent:context <TASK_ID>`
2. GitNexus MCP for structural questions
3. Targeted read/grep — not full module scans
4. `pnpm agent:contract-slice` for API ops — never full OpenAPI

## Explicit skips

Do not invoke superpowers workflow, ECC bulk skills, gstack, or Understand-Anything — they conflict with the ticket workflow in `ai-sales-backend`.
