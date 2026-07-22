---
name: design-md
description: >
  Use Google Labs DESIGN.md format + @google/design.md CLI to lint, diff, and
  export design tokens. Use when creating or updating DESIGN.md, syncing
  tokens with packages/design-tokens, exporting Tailwind/DTCG tokens, or when
  the user mentions design.md / designmd. Not a full design system generator —
  prefer ui-ux-pro-max or packages/design-tokens for aesthetic direction.
---

# DESIGN.md

Repo: https://github.com/google-labs-code/design.md

## When

- Authoring `DESIGN.md` for a surface (web-admin, super-admin, windows-client)
- Linting token consistency before changing `@ai-sales/design-tokens`
- Exporting tokens to Tailwind / DTCG

## Commands

```bash
npx -p @google/design.md designmd lint DESIGN.md
npx -p @google/design.md designmd diff DESIGN.md --base main
npx -p @google/design.md designmd export DESIGN.md --format tailwind
```

## Rules for this monorepo

- F00: no approved Figma/brand yet — treat DESIGN.md as provisional, not source of truth over `packages/design-tokens`.
- Prefer semantic tokens already in `@ai-sales/design-tokens`; do not invent parallel purple/cream AI-slop palettes.
- Keep DESIGN.md thin; do not dump full style guides into always-on context.
