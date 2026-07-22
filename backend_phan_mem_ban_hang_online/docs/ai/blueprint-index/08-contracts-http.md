# Blueprint §8 — HTTP API contract

**Source:** `backend_doc/01_BACKEND_ENTERPRISE_IMPLEMENTATION_BLUEPRINT_v2.0.md` §8.1–8.11

- Contract source of truth is `contracts/openapi.yaml`, written before or with the implementation PR; no hand-maintained parallel `shared-types`. Lint blocks any operation missing `operationId`, error response, security, permission extension, idempotency declaration, or example (§8.1).
- Standard OpenAPI extensions: `x-permission`, `x-idempotency`, `x-audit-action`, `x-feature-flag`, `x-slo-class`, `x-data-classification`.
- Base path `/api/v1`; success `application/json`; error `application/problem+json` per RFC 9457 (§8.2, §8.5).
- Standard headers: `Authorization`, `X-Request-Id`, `X-Correlation-Id`, `Idempotency-Key`, `If-Match`/`ETag`, `Traceparent`, `Retry-After`, `Deprecation`/`Sunset`. Clients cannot switch tenant via a header — only via login/switch-tenant endpoint (§8.3).
- Error status mapping: 404 for cross-tenant/not-visible resources (never leak existence), 409 for conflict/idempotency/inventory, 412 for `If-Match` mismatch, 422 for business validation, 429 for rate/quota (§8.5.1).
- Idempotency is required on: create order/reservation/payment/shipment/return, confirm/cancel order, send outbound message, import confirm/apply, provider payment/webhook callbacks, ops reprocess, AI tool mutation. Scope key is `(tenant_id, actor_or_client_id, operation_id, idempotency_key)`; TTL 24h default, ≥7d for order/payment/message (§8.7).
- Cursor pagination default (limit 50/max 100, opaque signed cursor, allowlist filters only) (§8.6). Optimistic concurrency via `ETag`/`If-Match`, `412 RESOURCE_VERSION_MISMATCH` on stale writes (§8.8).
- Full endpoint catalog by module lives in §8.9.1–8.9.10 (Auth/Identity/Tenant, Customer, Catalog/Import, Inventory, Knowledge, Channel/Webhook, Conversation, AI, Order/Payment/Fulfillment, Analytics/Billing/Ops) — grep the module's own subsection for exact method/path/permission/idempotency per endpoint rather than reading all of §8.9.
- Critical command payload shapes: create reservation (§8.10.1), confirm order (§8.10.2), send message (§8.10.3) — each requires server-side revalidation of tenant/permission/state/version before commit.
- Deprecation: additive optional fields are backward compatible; new enum values, required/type/meaning changes, or field removal are breaking and need `/v2` or a parallel contract with ≥1 release cycle deprecation window (§8.11).
