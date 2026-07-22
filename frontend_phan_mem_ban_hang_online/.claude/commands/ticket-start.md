---
description: Kick off an FE-* ticket — load its context, check the design-spec handoff gate, and draft Preflight
argument-hint: <TASK_ID>
---

Ticket: $ARGUMENTS

## Steps

1. Read `frontend_doc/00_FRONTEND_IMPLEMENTATION_SPEC_ENTERPRISE_GRADE_v2.0.md` §1.4's own routing
   table to find which sections this ticket actually needs (don't read the whole 5600-line file) —
   plus the module's own §21 subsection, and §22 (Definition of Ready/Done).
2. **If this ticket implements or modifies a screen's real UI** (not a pure package/infra ticket):
   check that screen's row in [`docs/ux/handoff-checklist.md`](../../docs/ux/handoff-checklist.md).
   - `Not started` → **stop here and run the Design AI Agent first**
     (`.claude/agents/design-spec-writer.md`) for this screen before writing any component code.
     This is the step most likely to be silently skipped — the design-spec gate has no automated
     block on file writes, so this manual check is the actual enforcement mechanism. Do not
     rationalize skipping it because the screen "seems simple."
   - `Drafted — pending Human Owner copy review` → the design-spec exists; you may start
     structural implementation (layout/components/states per the spec) but must not ship
     user-facing copy as final until Human Owner has reviewed it (see
     `backend/docs/collaboration/SIGNOFF_TRACKER.md`'s "Design/copy approval" entry).
   - `READY-MOCK` → proceed normally.
3. Check whether `docs/tickets/$ARGUMENTS.md`-equivalent ticket notes already exist for this ID (if
   this repo starts tracking FE tickets as files the way backend does — currently FE tickets live
   in the phase backlog tables in the spec itself, not individual files).
4. Draft a **Preflight** summary: affected routes/features/packages, contracts needed
   (`pnpm contracts:sync` output), permission keys involved (verify each exists in
   `packages/permissions/src/generated/permissionKeys.ts` — a key that doesn't resolve there is a
   contract gap, not a typo to silently work around), design-spec status (from step 2), and open
   questions.
5. Stop after Preflight and summarize open questions — including any `BLOCKED-CONTRACT` or
   `BLOCKED-DESIGN` condition found above. Do not start implementation until Preflight is clear.
