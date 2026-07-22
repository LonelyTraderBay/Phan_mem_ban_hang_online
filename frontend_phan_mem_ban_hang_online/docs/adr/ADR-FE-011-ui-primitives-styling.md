# ADR-FE-011: UI primitives and styling

**Status:** Accepted

## Context

An enterprise product needs consistent, accessible interactive primitives (dialogs, dropdowns,
toasts, tabs) without reimplementing focus-trapping/ARIA wiring per component, and a single,
swappable source of truth for color/spacing/typography (spec 7.1).

## Decision

Radix UI (unstyled, accessible primitives) + CSS variables sourced from `@ai-sales/design-tokens`
+ CSS Modules for component styling. No hard-coded colors anywhere in `packages/ui`.

## Consequences

- `packages/design-tokens`'s `tokens.ts` is explicitly marked **PROVISIONAL** — no real design
  handoff exists yet (confirmed at scaffold time; per the current process, the Design AI Agent
  produces a text-based design spec, not a Figma file — see `docs/ux/handoff-checklist.md`), so
  the shipped palette is a neutral slate/blue placeholder. Swapping to real brand values later
  means editing one file; no consumer changes, since every consumer references semantic names
  (`color.action.primary`).
- `PermissionGate`/`FeatureFlagGate` are listed in spec 7.2's shared component catalog, which
  appears to conflict with "`packages/ui` cannot import `auth`/`permissions`" — resolved by making
  both components purely prop-driven (`allowed`/`enabled` computed upstream by the feature using
  `@ai-sales/permissions`/`@ai-sales/feature-flags`'s headless hooks). Documented in
  `packages/ui/README.md` so the pattern isn't rediscovered ad hoc per feature.
- `@storybook/test-runner` has a known compatibility gap with this Storybook 8.4/Vite setup (see
  `packages/ui/README.md`) — Storybook itself builds/serves fine; only the automated a11y-test CLI
  is affected, and is `continue-on-error` in CI until resolved.
