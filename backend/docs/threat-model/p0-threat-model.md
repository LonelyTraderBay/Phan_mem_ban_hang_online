# P0 Threat Model Seed

## Trust Boundaries

- Public internet to API edge.
- Provider webhook ingress to raw webhook storage.
- API/worker/scheduler to PostgreSQL runtime roles.
- API/worker/scheduler to Redis/BullMQ.
- API to FastAPI AI service over internal network.
- AI service to model and embedding providers.
- Object storage signed URL boundary.
- Support access boundary from platform staff to tenant data.

## Assets

- Tenant-owned business data, PII, inventory, orders, payments, conversations, provider credentials, prompt/model/tool logs, audit logs, and billing entitlements.

## Initial Abuse Cases

- Cross-tenant object reference via guessed UUID.
- Client-provided `tenant_id` used as authorization context.
- Webhook replay or forged signature.
- Duplicate order/payment/inventory mutation without idempotency.
- AI tool call attempting a high-risk mutation without approval.
- PII or secrets emitted to logs/traces/metrics.
- Migration deploying destructive schema change before old code is retired.

## Required P0 Follow-up

- Map STRIDE per boundary.
- Assign risk owners.
- Link mitigations to tests and CI gates.
- Add AI-specific eval/red-team cases before P8 implementation.
