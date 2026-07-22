---
adr_id: ADR-XXX
title: <Decision title>
status: proposed
created_date: YYYY-MM-DD
owners: [Backend AI Agent]
reviewers: [Backend AI Agent]
human_signoff_required: false
---

<!--
Ownership convention (this repo's build team is 2 AI agents + 1 human, not a human org):
- owners: almost always [Backend AI Agent] — it authors and is accountable for backend ADRs.
  Use [Frontend AI Agent] only for an ADR that is genuinely frontend-owned but filed here for
  cross-reference. Never list a human job title here (no "Backend Lead"/"Security Lead"/etc.) —
  see docs/domain/glossary.md's "Vai trò / Roles" section for the 4 real actors.
- reviewers: [Backend AI Agent] means self-review via the `.claude/agents/invariant-reviewer.md`
  and `.claude/agents/ticket-completion-reviewer.md` subagents (an independent process, not the
  same context as the authoring run). Add `Frontend AI Agent` if the decision changes a contract
  or behavior the frontend depends on. Add `Human Owner` only when the decision carries real
  business/legal/security risk that no AI agent can accept on its own — see the note below.
- human_signoff_required: true only for decisions the Human Owner must actually approve before
  it takes effect (e.g. anything that changes a security posture, data retention/legal exposure,
  or an irreversible production action). Most architecture ADRs are false — the Backend AI Agent
  can accept its own technical trade-offs once verified against the blueprint's invariants.
-->


# Context

What problem, constraints, scale, security/data implications and existing decisions apply?

# Decision

State one concrete decision. Avoid “A or B”. Include versions/protocols when relevant.

# Alternatives considered

| Alternative | Benefits | Costs/Risks | Rejection reason |
|---|---|---|---|

# Consequences

## Positive

## Negative / trade-offs

## Operational impact

## Security/privacy impact

## Migration and rollback

# Verification

- Tests/evidence required.
- Metrics/SLO affected.
- Review/expiry date if temporary.
