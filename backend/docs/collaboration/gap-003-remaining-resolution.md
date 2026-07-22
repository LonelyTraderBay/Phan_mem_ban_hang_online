# GAP-003 remaining — permission key resolution (W3 freeze)

**Status:** Closed 2026-07-22  
**Scope:** Non-F01 keys from FE OUTBOX (F02/F04–F08/F10/billing). F01 slice remains in `gap-003-f01-slice.md`.

## Method

Read CSV first. For each spec-only key: either **ALIAS** to an existing matrix key (FE must use canonical), or **ADD** a new matrix row when the capability is distinct.

## Alias map (spec / informal → canonical matrix key)

| Informal / spec key | Canonical | Rationale |
|---------------------|-----------|-----------|
| `role.write` | `role.manage` | F01 slice (already closed) |
| `category.read` | `catalog.read` | Categories are catalog entities |
| `category.write` | `catalog.write` | Same |
| `inventory.read_movements` | `inventory.read` | Movements are inventory reads |
| `inventory.movement.read` | `inventory.read` | Same |
| `inventory.reservation.read` | `inventory.read` | Reservation mutate stays `inventory.reserve` |
| `channel.health.read` | `channel.read` | Health is part of channel read model |
| `channel.disconnect` | `channel.manage` | Already on disconnectChannel |
| `channel.reauthorize` | `channel.manage` | Same family |
| `channel.webhook.read` | `channel.manage` | Webhook event list already `channel.manage` |
| `conversation.note.read` | `conversation.read` | Notes are conversation payload |
| `note.create` | `conversation.reply` | Notes created on reply path |
| `status.write` | `conversation.reply` | Status changes with reply/resolve |
| `attachment.read` | `conversation.read` | |
| `attachment.upload` | `conversation.reply` | |
| `ai.suggestion.create` / `ai.suggestion.read` / `ai.suggestion.*` | `ai.use` | |
| `ai.log.read` / `ai.blocked.read` | `ai.review` | |
| `ai.source.read` | `knowledge.read` | Published knowledge sources |
| `ai.prompt_internal.read` | `ai.configure` | Prompt internals |
| `order.write` | `order.create` | Draft mutate |
| `order.discount.apply` | `order.price.override` | |
| `order.cost.read` | `catalog.cost.read` | Cost is catalog-classified |
| `shipment.create` | `shipment.manage` | |
| `packing_slip.read` | `shipment.read` | Print uses dedicated key below |
| `billing.write` | `billing.manage` | |
| `billing.usage.read` / `billing.invoice.read` | `billing.read` | |
| `billing.payment_method.write` / `billing.plan.change` / `billing.cancel` | `billing.manage` | |

## New matrix keys (added W3)

| Key | Why distinct |
|-----|----------------|
| `catalog.import` | GAP-001 — bulk import ≠ day-to-day write |
| `catalog.publish` | GAP-001 — activate/publish ≠ draft edit |
| `ops.alert.acknowledge` | GAP-002 |
| `ops.ai.disable` | GAP-002 — platform kill ≠ tenant `ai.disable` |
| `ops.channel.manage` | GAP-002 |
| `customer.export` | Privacy-sensitive export |
| `ai.sandbox.test` | Non-production AI probe |
| `report.revenue.read` | Finer report gates |
| `report.sla.read` | Finer report gates |
| `report.ai_quality.read` | Finer report gates |
| `packing_slip.print` | Print/generate slip |

## OpenAPI rewires (W3)

| operationId | x-permission |
|-------------|--------------|
| createImportJob, analyzeImport, updateImportMapping, confirmImport, cancelImport | `catalog.import` |
| getRevenueReport | `report.revenue.read` |
| getSlaReport | `report.sla.read` |
| getAIQualityReport | `report.ai_quality.read` |
| createPackingSlipJob | `packing_slip.print` |
| disableTenantAI | `ops.ai.disable` |
| createCustomerPrivacyExport | `customer.export` |
| testAIMessage | `ai.sandbox.test` |

`catalog.publish` is in the matrix for FE/product-activate gates; wire a dedicated publish operation when introduced (do not invent client-side).
