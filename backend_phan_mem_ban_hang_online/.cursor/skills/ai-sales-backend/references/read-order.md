# Read Order for Agents

## Always (any task)

1. `backend_doc/START_HERE.md`
2. `docs/ai/CONTEXT_MAP.md`
3. `pnpm agent:context <TASK_ID>` output

## By task type

| Type | Read | Avoid loading whole |
|------|------|---------------------|
| Architecture / phase | `docs/ai/blueprint-index/00-overview.md`, sections 0–6, 18–20 | Full 4147-line blueprint |
| API endpoint | Sliced OpenAPI via `agent:contract-slice`, permission row, error codes | Full openapi.yaml |
| Events / SSE | `backend_doc/contracts/asyncapi.yaml` (781 lines — searchable) | — |
| Migration / RLS | Blueprint §6, ADR-002, `infra/migrations/` | — |
| Auth / identity | Blueprint §5, ADR-008, `modules/identity/README.md` | — |
| Order / money | Blueprint §7.11, ADR-006, state machines doc | — |
| AI tools | Blueprint §13, ADR-009 | — |
| New ticket | `backend_doc/templates/backend_ticket_template.md` | — |
| ADR | `backend_doc/templates/adr_template.md`, existing `docs/adr/` | — |

## Blueprint section quick links

Summaries in `docs/ai/blueprint-index/` point to anchors in `backend_doc/01_BACKEND_ENTERPRISE_IMPLEMENTATION_BLUEPRINT_v2.0.md`.

## Priority when rules conflict

1. Approved ADRs
2. Frozen sprint contracts
3. Blueprint v2.0
4. Matrices and templates
5. Ticket text
6. Existing code
