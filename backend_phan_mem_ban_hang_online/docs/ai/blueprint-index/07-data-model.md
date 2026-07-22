# Blueprint §7 — Data model (schemas)

**Source:** §7.1–7.13 (search `# 7.`)

- UUIDv7, timestamptz, tenant timezone (ADR-007).
- Money as minor units bigint (ADR-006).
- Per-domain schema sections: identity, customer, catalog, inventory, knowledge, channel/conversation, order/payment/fulfillment, analytics/billing/ops.
- Index conventions include cursor pagination indexes.
