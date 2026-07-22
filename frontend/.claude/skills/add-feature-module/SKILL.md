---
name: add-feature-module
description: Scaffold a new feature module under apps/<app>/src/features/<name>/ with the exact subfolder layout the ESLint import-boundary rule enforces. Use when starting a new feature/module in web-admin, super-admin, or windows-client, or when asked to "add a feature", "create a new module", or "scaffold a feature folder".
---

# Add a feature module

Every feature lives at `apps/<app>/src/features/<feature-name>/` and is reached from outside
**only** through its own `index.ts` (spec 4.3). `tooling/eslint-config/index.mjs` enforces this
with `no-restricted-imports` against exactly these subfolder names — don't invent a 9th name (e.g.
`utils/`), it won't be protected by the rule and signals an inconsistent structure to reviewers:

```
apps/<app>/src/features/<feature-name>/
├── index.ts        # the ONLY file other features/apps may import from
├── api/             # calls into @ai-sales/api-client, request/response mapping
├── components/      # feature-local React components (not shared — those go in packages/ui)
├── domain/          # feature-specific business logic/types (not @ai-sales/domain primitives)
├── hooks/            # feature-local hooks
├── routes/          # route definitions/loaders for this feature (react-router 7)
├── schemas/          # Zod schemas — business-specific validation lives HERE, not in @ai-sales/forms
├── state/            # feature-local state (Zustand/TanStack Query usage specific to this feature)
└── tests/            # unit/component tests for this feature
```

## Steps

1. Confirm the app (`web-admin`, `super-admin`, or `windows-client`) and a kebab-case feature name.
2. Create only the subfolders this feature actually needs right now — don't pre-create all 8 as
   empty placeholders; add a subfolder when the first file for it exists. `index.ts` is the only
   mandatory file at creation time.
3. Write `index.ts` as a barrel that re-exports only what other code legitimately needs (typically
   a route entry and/or a small number of components/hooks) — not a blanket `export *` from every
   subfolder.
4. If the feature needs a new permission or feature flag, use the `add-permission-or-flag` skill
   first so the gating hooks exist before wiring up UI.
5. If the feature calls the API, go through `@ai-sales/api-client` (never `@ai-sales/api-generated`
   directly) and put DTO→view-model mapping in `api/*.mapper.ts` (spec 3.4).
6. Add tests under `tests/` as you go — `pnpm --filter @ai-sales/<app> run test` uses Vitest with a
   modest coverage floor (see `docs/runbooks/ci-troubleshooting.md`'s coverage-threshold section);
   an empty `tests/` folder with zero coverage on new files will fail that gate.

## After scaffolding

Run `pnpm --filter @ai-sales/<app> run lint` once real imports exist — this is what actually
enforces the boundary rule (import-boundary violations are caught by ESLint, not by this skill).
