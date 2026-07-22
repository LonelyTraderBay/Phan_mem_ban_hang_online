# Blueprint §3 — Monorepo structure

**Source:** §3.1–3.4 (search `# 3.`)

- Layout: `apps/`, `packages/`, `modules/`, `infra/`, `docs/`, `tools/`.
- Each module: domain → application → infrastructure → presentation.
- Domain MUST NOT import framework/DB/queue/HTTP SDKs.
- Cross-module: commands via ports, events via outbox.
