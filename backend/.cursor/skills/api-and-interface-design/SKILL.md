---
name: api-and-interface-design
description: Contract-first API and module boundary design for NestJS backend. Use when designing or changing OpenAPI operations, module ports, DTOs, error semantics, or cross-module interfaces. Use for BE-FND-005 and any BE-* ticket touching contracts.
---

# API and Interface Design

Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT).

## Prime directive

Blueprint + frozen OpenAPI win. Run `pnpm agent:contract-slice --tag <Tag>` — never load full OpenAPI. Update contract before implementation.

## When to use

- New or changed REST endpoints
- Module application ports and DTOs
- Error catalog and permission matrix entries
- Breaking or additive API changes

## Process

1. **Contract first** — update `backend_doc/contracts/openapi.yaml`, error/permission catalogs.
2. **Validate at boundaries** — HTTP handlers and webhook ingress only; trust internal domain after validation.
3. **Consistent errors** — one shape from `backend_doc/matrices/error_catalog.csv`; map to HTTP status consistently.
4. **Additive changes** — optional fields; never remove or retype published fields without ADR.
5. **Hyrum's Law** — every observable behavior becomes a dependency; document intentional behavior.

## Backend conventions

- REST: plural nouns, camelCase query/response fields
- Pagination on all list endpoints
- PATCH for partial updates; idempotency keys on critical mutations
- Input/output separation: `CreateXInput` vs `X` response with server fields
- Cross-module: commands via application ports; events via outbox — not direct DB access

## Anti-rationalization

| Excuse | Reality |
|--------|---------|
| "Document API later" | OpenAPI is the spec; code follows contract |
| "No pagination yet" | Add from day one on list endpoints |
| "Internal API, no contract" | Ports between modules still need typed contracts |

## Verification

- [ ] OpenAPI updated and `pnpm contracts:validate` passes
- [ ] Error + permission catalog entries exist
- [ ] Validation at HTTP/webhook boundary only
- [ ] List endpoints paginated
- [ ] Changes backward compatible or ADR documents break
