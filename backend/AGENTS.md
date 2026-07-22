# AI Sales Backend — Agent Entry Point

This repository implements the AI Sales Operating System backend. Blueprint v2.0 in `backend_doc/` is the source of truth.

> Using Claude Code instead of Cursor? Start at [`CLAUDE.md`](CLAUDE.md) — it imports this file
> and layers on Claude-Code-native subagents, commands, and hooks. The rules below apply either
> way.

## Build team model

This project's build team is **you (Backend AI Agent)** + **Frontend AI Agent** (separate repo,
`frontend/`) + **Design AI Agent** (FE-side, produces design specs) + one **Human Owner** — not a
human org. Don't defer to or invent "Backend Lead", "Security Lead", "Platform/SRE", "QA Lead",
etc. — see [`docs/domain/glossary.md`](docs/domain/glossary.md)'s "Vai trò / Roles" table for the
full mapping of what used to be human roles. You self-certify routine technical work (following
blueprint invariants, passing tests, following an approved ADR); only the Human Owner accepts real
business/security/legal risk or approves an irreversible action (staging/production go-live, real
infra spend) — see [`docs/collaboration/SIGNOFF_TRACKER.md`](docs/collaboration/SIGNOFF_TRACKER.md).
You and the Frontend AI Agent coordinate **asynchronously via files only** — there is no live chat
between the two agents; see [`docs/collaboration/CONTRACT_WORKFLOW.md`](docs/collaboration/CONTRACT_WORKFLOW.md)
and [`docs/collaboration/contract-gap-board.md`](docs/collaboration/contract-gap-board.md).

**Running multiple ticket instances concurrently in this one repo**: if more than one Backend AI
Agent instance is active against `backend/` at the same time (e.g. several tickets dispatched in
parallel), each instance MUST work in its own `git worktree`
(`git worktree add ../backend-<ticket-id> -b ticket/<ticket-id>`) — never share one working tree
across simultaneously-active tickets. Two agents editing uncommitted files in the same working tree
will silently clobber each other; a shared *repo* with separate *worktrees* per ticket avoids this
without needing any new tooling (Claude Code's `isolation: worktree` already does this for you when
available).

## Agent stack priority

When instructions conflict, follow this order:

1. Blueprint v2.0 + approved ADRs + frozen sprint contracts
2. `pnpm agent:context <TASK_ID>` read set
3. [`.cursor/skills/ai-sales-backend/SKILL.md`](.cursor/skills/ai-sales-backend/SKILL.md)
4. Scoped [`.cursor/rules/`](.cursor/rules/) (always-on: invariants, karpathy, ponytail)
5. On-demand skills in [`.cursor/skills/`](.cursor/skills/) — one at a time
6. GitNexus MCP graph (navigation only — does not override invariants)

## Cursor setup (in repo)

| Resource | Purpose |
|----------|---------|
| [`.cursor/rules/`](.cursor/rules/) | Scoped rules by file pattern + always-on discipline |
| [`.cursor/skills/ai-sales-backend/`](.cursor/skills/ai-sales-backend/SKILL.md) | Project skill — workflow, routing, hard stops |
| [`.cursor/skills/agent-stack-router/`](.cursor/skills/agent-stack-router/SKILL.md) | Task → skill routing |
| [`docs/ai/CONTEXT_MAP.md`](docs/ai/CONTEXT_MAP.md) | Task → read set routing |
| [`pnpm agent:context`](package.json) | CLI: task context for any `BE-*` ID |
| [`.gitnexusrc`](.gitnexusrc) | GitNexus config (preserves this AGENTS.md) |

### Always-on rules (compact)

| Rule | Role |
|------|------|
| `00-global-invariants` | Enterprise non-negotiables |
| `05-karpathy-guidelines` | Surgical changes, simplicity, goal-driven |
| `06-ponytail` | YAGNI ladder (with enterprise carve-out) |
| `10–60-*` | Scoped by file pattern (domain, Nest, DB, contracts, Python) |

### On-demand skills

| Skill | Use when |
|-------|----------|
| `api-and-interface-design` | OpenAPI, DTOs, module boundaries |
| `security-and-hardening` | Auth, RLS, webhooks, PII, AI boundaries |
| `test-driven-development` | Implement or fix behavior |
| `doubt-driven-development` | Payment, order, idempotency, migrations |
| `debugging-and-error-recovery` | CI fail, bugs, unexpected errors |
| `ponytail` / `ponytail-review` / `ponytail-audit` / `ponytail-debt` / `ponytail-gain` / `ponytail-help` | Lazy-mode intensity, over-engineering review/audit, deferred-shortcut ledger, help |

## Quick start for agents

```bash
pnpm agent:context BE-FND-009          # what to read for idempotency work
pnpm agent:contract-slice --tag Auth  # slice OpenAPI instead of full file
pnpm agent:gitnexus-reindex           # re-index codebase graph after large merge
pnpm verify                           # must pass before claiming done
```

## Read order

1. `backend_doc/START_HERE.md`
2. `docs/enterprise-freeze/README.md` — **full-product doc freeze playbook (mandatory)**
3. `docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md` — **PASS (2026-07-22)**; feature code allowed per DOC_GATE phase order
4. `docs/readiness/ENTERPRISE_DOC_GATE.md` — kickoff **BE-IDN-001** then Identity/F01; no phase jumping
5. `docs/ai/CONTEXT_MAP.md` or `pnpm agent:context <TASK_ID>`
6. Relevant blueprint section via `docs/ai/blueprint-index/` (not the full 4147-line file)
7. Contracts/matrices for the affected operation only

## Local tooling (per developer machine)

These are not committed to the repo. Run once per machine:

### GitNexus (codebase graph + MCP)

Requires Cursor 2.4+ for project hooks in `hooks/`.

```powershell
pnpm --allow-build=@ladybugdb/core --allow-build=gitnexus --allow-build=tree-sitter dlx gitnexus@latest analyze
gitnexus setup -c cursor
# Claude Code instead: gitnexus setup -c claude
# (skills already committed under .claude/skills/gitnexus/ — this only wires up the MCP server)
```

MCP tools: `query`, `context`, `impact`, `detect_changes`, `rename`. Use for cross-module exploration before bulk grep.

Debug hooks: `$env:GITNEXUS_DEBUG=1`

### Headroom (context compression)

```powershell
pip install "headroom-ai[all]"
headroom wrap cursor
headroom doctor
```

- Unwrap: `headroom unwrap cursor`
- Dashboard: `headroom dashboard`
- Optional token savings: configure Cursor **Settings → Models → Override OpenAI Base URL** to `http://127.0.0.1:8787/p/backend/v1` (proxy must be running)
- `.cursorrules` (rtk instructions) is machine-generated — gitignored, do not commit

### Ponytail (lazy senior mode)

Already wired in-repo:

- Cursor always-on rule: `.cursor/rules/06-ponytail.mdc` (upstream ladder + enterprise carve-out)
- Cursor on-demand skills: `.cursor/skills/ponytail*`
- Claude Code project plugin: `ponytail@ponytail` via `.claude/settings.json`

One-time Claude Code refresh on another machine:

```powershell
claude plugin marketplace add DietrichGebert/ponytail --scope project
claude plugin install ponytail@ponytail --scope project
```

## Onboarding checklist (new developer)

1. Clone repo, run `pnpm install`
2. Read `backend_doc/START_HERE.md` and this file
3. Run GitNexus analyze + setup (above)
4. Optional: install Headroom wrap
5. Start a ticket with `pnpm agent:context <TASK_ID>`

## Non-negotiables

See [`.cursor/rules/00-global-invariants.mdc`](.cursor/rules/00-global-invariants.mdc) — tenant context, RLS, pure domain, outbox/inbox, idempotency, money as integers, AI zero-trust.

## Ticket workflow

Preflight → contract first → test design → migration → implementation → `pnpm verify` → completion manifest.

Template: `backend_doc/templates/backend_ticket_template.md` · Tickets: `docs/tickets/`

## Explicit skips (do not install full)

| Tool | Reason |
|------|--------|
| superpowers (full) | Conflicts with ticket workflow; high token subagent loops |
| ECC (bulk 261 skills) | Context bloat; cherry-pick guides only if needed |
| Understand-Anything | Overlaps GitNexus; expensive full-scan |
| gstack (full) | Product/QA browser workflow; not BE ticket flow |
| ui-ux-pro-max, design.md | Frontend-only; not this repo |

Reference upstream patterns only — blueprint always wins.
