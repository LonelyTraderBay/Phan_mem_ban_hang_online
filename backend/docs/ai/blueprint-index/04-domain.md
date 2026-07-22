# Blueprint §4 — Domain model

**Source:** §4.1–4.3 (search `# 4.`)

- 16 bounded contexts (see `docs/ai/CONTEXT_MAP.md` module map).
- Cross-domain dependencies documented; no direct table reads across modules.
- System-wide invariants: tenant isolation, idempotency, audit append-only.
