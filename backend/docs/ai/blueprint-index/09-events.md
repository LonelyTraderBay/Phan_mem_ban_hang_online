# Blueprint §9 — Event, queue and realtime contract

**Source:** `backend_doc/01_BACKEND_ENTERPRISE_IMPLEMENTATION_BLUEPRINT_v2.0.md` §9.1–9.10

- Internal/realtime event schema lives in `contracts/asyncapi.yaml`; producers cannot publish an unschemaed/unversioned payload, and CI compatibility-checks event schemas. Business events are past-tense facts — commands/jobs never masquerade as events (§9.1).
- CloudEvents-compatible envelope: `id` (UUIDv7), `type` (namespaced + major version), `time` (business occurrence, not ingestion), `tenantid`, `correlationid`/`causationid`, `partitionkey`, `data`. No secrets in payload; PII only with classification approval (§9.2).
- Delivery is at-least-once, never exactly-once end-to-end; consumers MUST be idempotent by `event_id`/business key; ordering is only guaranteed per `partitionkey` (§9.3).
- Transactional outbox (`outbox_events`): producer commits business state and outbox row in the same transaction; publisher does `SELECT ... FOR UPDATE SKIP LOCKED` batch + lease + exponential backoff to DLQ on max attempts. Never publish directly from the request handler as the sole mechanism (§9.4).
- Consumer inbox/dedupe (`inbox_events`, unique `(consumer_name, event_id)`): side effect happens inside the transaction; only transient errors retry, validation/business-poison events go to quarantine/DLQ (§9.5).
- Queue topology: `webhook.process`, `message.send`, `ai.suggest`, `knowledge.ingest`, `import.apply`, `inventory.expire`, `analytics.project`, `notification.emit`, `maintenance.reconcile` — payloads carry IDs/refs, not full PII/content (§9.6).
- Retry/DLQ policy is keyed by error class (network/auth/validation/business/deadlock/AI-timeout); default backoff 5s/30s/2m/10m/30m. DLQ reprocess only via ops API with permission/reason/audit, replayed under the same event/job ID (§9.7).
- Full internal domain event catalog (producer, main consumer, minimum payload) is in §9.8 — tenant/membership/customer/catalog/inventory/knowledge/channel/message/conversation/ai/order/payment/shipment/return/billing/audit events. Consumers needing more than the minimum payload must query a read model, not expect a fatter event.
- Realtime SSE (`GET /realtime/stream`): tenant+permission-scoped stream, Redis replay buffer ≥15min/10k events per user, `system.resync_required` when `Last-Event-ID` is too old, heartbeat every 15–30s, no raw secrets/full PII. SSE is not the source of truth — lost events recover via REST refetch (§9.9).
- Webhook ingress flow: WAF/rate-limit → signature verify on raw bytes → dedupe insert into `webhook_events` → fast `2xx` ACK → enqueue `webhook.process` → normalize → idempotent identity/conversation/message upsert → outbox domain event. No AI/order logic runs synchronously before the ACK (§9.10).
