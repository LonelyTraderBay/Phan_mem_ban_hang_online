# Claude Code entry point

@AGENTS.md

## Claude Code-specific additions

Everything above is imported from `AGENTS.md` — the single source of truth for agent
instructions in this repo (written for Cursor, equally binding here). Don't duplicate its
rules; only the Claude-Code-native tooling below is new.

### Subagents — `.claude/agents/`

- `invariant-reviewer` — read-only check of the current diff against the non-negotiables in
  `.cursor/rules/00-global-invariants.mdc` (tenant isolation, pure domain, outbox/inbox,
  idempotency, money-as-integers, AI zero-trust). Run before finishing any ticket that touches
  domain or persistence code.
- `ticket-completion-reviewer` — checks a ticket's diff and `docs/tickets/<ID>.md` against
  `backend_doc/templates/backend_ticket_template.md`'s acceptance criteria and completion
  manifest. Run before marking a ticket done.
- `module-test-writer` — generates the vitest suites (tenant isolation, permission negative,
  idempotency, contract) that even the `modules/audit` reference pattern is currently missing.

### Commands — `.claude/commands/`

- `/ticket-start <TASK_ID>` — loads `pnpm agent:context`, creates `docs/tickets/<ID>.md` from
  the template if missing, drafts the Preflight section.
- `/verify-report` — runs `pnpm verify`, summarizes failures by check instead of dumping raw
  output.
- `/new-module <name>` — runs `pnpm scaffold:module`, then wires the module to the
  `modules/audit` reference pattern (ports, `withTenantTransaction`, `requirePermission`) and
  requires the test categories `modules/audit` itself is still missing.

### Hooks — `.claude/settings.json` + `.claude/hooks/post-edit.mjs`

- Formats/lints edited `.ts`/`.mjs` files with Prettier + ESLint `--fix` after every edit.
- Re-runs `pnpm contracts:validate` after edits to `openapi*`/`asyncapi*` contract files — the
  Claude Code equivalent of `.cursor/hooks.json`'s `afterFileEdit`.
- `permissions.deny` blocks Read/Edit/Write on real `.env*` files and Edit/Write on lockfiles
  and `backend_doc/MANIFEST.sha256`.
- `permissions.allow` pre-approves the read-only/verification commands already central to the
  ticket workflow (`pnpm verify`, `git diff`, etc.) so they don't prompt every time.

### MCP — `.mcp.json`

- `context7` (committed, no local install) — live docs for NestJS/FastAPI/Pydantic/Vitest
  instead of relying on training data.
- GitNexus is **not** in `.mcp.json` on purpose — same per-machine, not-committed convention as
  the Cursor setup in `AGENTS.md`. One-time local setup for Claude Code:

  ```powershell
  gitnexus setup -c claude
  ```

  The skills are already committed at `.claude/skills/gitnexus/` — read `gitnexus-guide` first.

### Skills

`.claude/skills/gitnexus/` is auto-discovered by Claude Code. `.cursor/skills/*` are **not** —
Claude Code doesn't scan `.cursor/`. `AGENTS.md`'s routing table still applies: read the
relevant `.cursor/skills/<name>/SKILL.md` on demand yourself, same as Cursor would.

### Ponytail plugin

Project-scoped via `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`).
Commands: `/ponytail`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`,
`/ponytail-help`. Always-on Cursor rule `.cursor/rules/06-ponytail.mdc` still wins for
enterprise carve-outs — do not simplify away invariants.
