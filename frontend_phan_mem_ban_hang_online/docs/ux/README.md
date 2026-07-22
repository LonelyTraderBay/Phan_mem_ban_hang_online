# UX

This project has no human designer — the Design AI Agent (`.claude/agents/design-spec-writer.md`)
produces text/markdown design-spec documents instead of a Figma file, satisfying spec §7.7's
"Figma handoff gate" in substance (same 8 required elements, same 6 required states) with a
different artifact format. See [`handoff-checklist.md`](handoff-checklist.md) for the per-screen
process and [`design-specs/_TEMPLATE.md`](design-specs/_TEMPLATE.md) for the document structure.

F01 auth + settings design-specs are Drafted (pending Human Owner copy review) under
`design-specs/` — see `handoff-checklist.md`. Other modules still have no design-specs.

Until a screen's design-spec exists and has had a Human Owner copy review:

- `packages/design-tokens` ships a **PROVISIONAL** neutral placeholder palette (see its README)
  so component/app scaffolding isn't blocked — but no screen can pass spec 7.7's `READY-MOCK` gate
  (which requires happy/empty/loading/error/forbidden/conflict states, in the design-spec, per
  `handoff-checklist.md`) until its design-spec exists and Human Owner has reviewed the copy.
- Do not treat any current screen's visual details (spacing, color, copy) as final — they exist
  only to prove the technical layering works (F00.6 exit criterion), not as approved UX.

## How to start designing a screen

Use [`handoff-checklist.md`](handoff-checklist.md) — it has the per-screen requirement checklist,
the full screen inventory (from the route map, spec §8.1), and the process for running the Design
AI Agent, getting a Human Owner copy review, and handing the result to the Frontend AI Agent for
implementation.
