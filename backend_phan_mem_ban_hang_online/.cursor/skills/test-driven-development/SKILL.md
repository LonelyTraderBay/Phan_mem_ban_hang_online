---
name: test-driven-development
description: Red-green-refactor TDD for backend logic. Use when implementing behavior, fixing bugs, or changing existing functionality. Use Prove-It pattern for bugs. Run pnpm verify after changes.
---

# Test-Driven Development

Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT).

## Prime directive

Tests are proof — "seems right" is not done. Run `pnpm verify` (+ `pnpm test:py` if ai-service touched).

## When to use

- New domain logic, application services, handlers
- Bug fixes (Prove-It: failing test first)
- Behavior changes with regression risk

**Skip:** pure config, docs-only, contract YAML without logic.

## Cycle

```
RED → write failing test
GREEN → minimal code to pass
REFACTOR → clean up; tests still pass
```

## Test pyramid (this repo)

| Layer | Tool | Focus |
|-------|------|-------|
| Unit (~80%) | vitest | Pure domain, no I/O |
| Integration (~15%) | vitest + test DB | API, RLS, repos |
| Python (~ai-service) | pytest | FastAPI routes, tools |

## Required test types for BE tickets

- Happy path
- Tenant isolation negative
- Permission negative (if auth)
- Idempotency replay (if mutation)
- Concurrency where applicable

## Prove-It (bugs)

1. Write test reproducing bug → must FAIL
2. Fix root cause → test PASSES
3. Full suite green

## Good tests

- State-based assertions, not mock interaction chains
- DAMP over DRY — readable standalone tests
- Descriptive names: `it('rejects client-provided tenant_id for authorization', ...)`

## Anti-rationalization

| Excuse | Reality |
|--------|---------|
| "Tests after code works" | Tests after code test implementation, not behavior |
| "Too simple to test" | Simple code gets complicated; test documents contract |
| "I'll add tests later" | Later never comes |

## Verification

- [ ] Every new behavior has a test
- [ ] Bug fixes include reproduction test
- [ ] `pnpm verify` passes
- [ ] No skipped/disabled tests without ticket note
