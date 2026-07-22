# Local setup runbook

## Prerequisites

- Node (version pinned in `.nvmrc` — currently `24.18.0`).
- `corepack` (ships with Node) — `corepack enable` if `pnpm` isn't already on `PATH`.
- Rust/Cargo (only needed for `apps/windows-client` — `cargo --version` should show 1.77+).

**Windows-specific gotcha (confirmed during F00 scaffolding):** `corepack enable` may fail with
`EPERM` writing shims into `C:\Program Files\nodejs` without admin rights. If so, install pnpm
directly instead: `npm install -g pnpm@11.9.0` — this puts a real `pnpm` binary on `PATH`, which
Turborepo needs (it doesn't resolve `corepack pnpm.cmd` shims for `--filter`).

## First-time setup

```sh
cd frontend
pnpm install                      # first install may prompt to approve postinstall scripts
                                   # (esbuild, msw, @swc/core) — see pnpm-workspace.yaml's
                                   # allowBuilds comments for why each is safe to approve
pnpm contracts:sync                # pulls the backend's real OpenAPI/AsyncAPI/permission/error
                                    # contracts into contracts/
pnpm codegen:api                   # generates packages/api-generated/src/generated/*.d.ts
pnpm --filter @ai-sales/feature-flags run codegen   # generates the typed flag-key union
```

## Day-to-day

```sh
pnpm dev:web-admin      # http://localhost:5173
pnpm dev:super-admin    # http://localhost:5174
pnpm --filter @ai-sales/ui run storybook   # http://localhost:6006

pnpm lint               # all packages
pnpm typecheck           # all packages
pnpm test                # all packages
pnpm build               # all packages/apps + Storybook static build
pnpm --filter @ai-sales/web-admin run test:e2e   # Playwright smoke (requires Chromium installed:
                                                   # `pnpm exec playwright install chromium`)
```

## Re-syncing after a backend contract change

```sh
pnpm contracts:sync && pnpm codegen:api
```

If this produces a diff, review it like any other contract change before committing — it's the
whole point of the codegen-diff-check CI gate (`pnpm codegen:check-clean`).

## Windows desktop client

```sh
cd apps/windows-client
cargo check --manifest-path src-tauri/Cargo.toml   # verifies the Rust side compiles
pnpm dev                                            # Vite dev server only (no Tauri window yet —
                                                     # full `tauri dev` wiring is F10's job)
```
