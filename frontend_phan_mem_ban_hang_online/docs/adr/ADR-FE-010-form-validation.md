# ADR-FE-010: Form/validation

**Status:** Accepted

## Context

Client-side form validation needs to stay separate from (and not a substitute for) the server's
own validation of the same fields — the two serve different purposes (fast UX feedback vs. the
authoritative check).

## Decision

React Hook Form for form state/rendering, Zod for schema validation, wired via
`@hookform/resolvers/zod` (`packages/forms`'s `useZodForm`).

## Consequences

- `packages/forms` ships only business-rule-free common validators (`nonEmptyString`,
  `emailAddress`, `isoDateString`, `nonNegativeInteger`) — anything tenant/domain-specific (a
  particular SKU pattern, phone format) belongs in the owning feature's own `schemas/`, not here.
- Field-level server validation errors (`field_errors[].path`, spec 11.4) map onto RHF's error
  state by path; unmapped paths surface as a form-level error rather than being silently dropped.
- Zod is also reused for runtime contract validation outside forms proper — `@ai-sales/config`'s
  runtime-config schema and `@ai-sales/auth`'s session-bootstrap schema both use Zod for the same
  reason: validate untrusted/external JSON before trusting its shape.
