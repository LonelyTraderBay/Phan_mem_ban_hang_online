# @ai-sales/super-admin

Super Admin / Operations portal — a deliberately **separate app, origin, and session** from
web-admin (ADR-FE-004), covering spec 1.2's Super Admin scope: tenant health, channel/AI/system
health, feature flags, support elevation, emergency disable controls, alerts, audit.

- Dev server: `pnpm dev:super-admin` from repo root (or `pnpm dev` here) → http://localhost:5174.
- Stack: React 19, Vite 6, react-router 7, TanStack Query 5 — same core stack as web-admin, but
  two real, non-obvious deltas:
  - **No `@ai-sales/feature-flags` dependency** (web-admin has it; super-admin doesn't).
  - **No `test:e2e` script** (web-admin has a Playwright suite; this app doesn't yet).
- Never share a session or auth store instance with web-admin — each app creates its own
  `@ai-sales/auth` session store by design (ADR-FE-004); don't "simplify" this by hoisting a
  shared instance.
- `pnpm test` uses `vitest run --passWithNoTests`, same as web-admin — empty suite is expected.
