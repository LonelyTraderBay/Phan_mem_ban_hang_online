---
name: doubt-driven-development
description: Adversarial review of non-trivial decisions before they stand. Use for payment, order, idempotency, migrations, irreversible ops, cross-module coupling, or when correctness matters more than speed. CLAIM → EXTRACT → DOUBT → RECONCILE → STOP.
---

# Doubt-Driven Development

Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT).

## Prime directive

Blueprint invariants are non-negotiable. Doubt the implementation — never doubt away RLS, idempotency, audit, or transaction safety.

## When to use (non-trivial decisions)

- Branching logic crossing module boundaries
- Idempotence, ordering, money, ledger invariants
- Data migrations, public API breaks
- Claims: "this is safe", "this is idempotent", "RLS covers this"

**Skip:** renames, formatting, obvious one-liners, pure reads.

## Process

```
1. CLAIM — state decision + why it matters (2-3 lines)
2. EXTRACT — artifact (diff/function) + contract (invariants it must satisfy)
3. DOUBT — adversarial review: "find issues, do not validate"
4. RECONCILE — classify: contract misread | actionable | trade-off | noise
5. STOP — trivial findings, 3 cycles max, or user says ship
```

## Adversarial prompt template

```
Find what is wrong. Assume overconfidence. Look for:
- Unstated assumptions
- Edge cases, race conditions
- Tenant/RLS bypass paths
- Idempotency gaps
- Contract violations vs OpenAPI

ARTIFACT: <diff or function>
CONTRACT: <invariants, ticket acceptance criteria>
```

Pass ARTIFACT + CONTRACT only — not your CLAIM.

## Backend-specific contracts to check

- Money: integer minor units only
- No hard-delete on ledger/order/payment/audit/events
- Outbox/inbox for cross-module events
- Server-established tenant context
- OpenAPI + permission + error catalog aligned

## TDD overlap

A failing test from RED step satisfies DOUBT for behavioral claims.

## Verification

- [ ] Non-trivial decision named as CLAIM
- [ ] At least one adversarial review (or failing test)
- [ ] Findings classified, not rubber-stamped
- [ ] Stop condition met
