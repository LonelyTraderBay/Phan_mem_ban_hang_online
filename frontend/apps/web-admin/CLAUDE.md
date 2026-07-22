# @ai-sales/web-admin

Tenant-facing web admin (spec 8.1 route map: Onboarding, Dashboard/Reports, Smart Inbox, AI
Copilot, Orders/Payments/Shipping, Product/SKU/Import, Inventory, Knowledge/Policy, Channel
Connect/Health, Users/Roles/Devices, Audit Logs, Billing/Usage).

- Dev server: `pnpm dev:web-admin` from repo root (or `pnpm dev` here) → http://localhost:5173.
- Stack: React 19, Vite 6, react-router 7, TanStack Query 5. Depends on every shared package
  including `@ai-sales/feature-flags` (unlike `super-admin`, see `apps/super-admin/CLAUDE.md`).
- `pnpm test` uses `vitest run --passWithNoTests` — an empty test suite is expected at this stage,
  don't assume a feature has tests just because the script exists.
- `pnpm test:e2e` runs Playwright against `apps/web-admin/e2e` via the root `playwright.config.ts`
  (chromium + msedge projects, `webServer` auto-starts this app's dev server).
- Feature boundary: code under `src/features/<name>/` is reached from outside only via that
  feature's own `index.ts` — no deep imports into a sibling feature's internals (see root
  CLAUDE.md's ESLint conventions section).
