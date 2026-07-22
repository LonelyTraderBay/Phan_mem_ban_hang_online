# GAP-003 remaining ledger — permission-key decisions (non-F01)

**Status:** Open — decision ledger only (do not invent keys in FE/BE code)  
**Date:** 2026-07-21  
**Related:** `gap-003-f01-slice.md` (Closed) · FE `OUTBOX.md` systemic drift entry · gap board GAP-003

## Rule for AI agents

1. **Source of truth** = `backend_doc/matrices/permission_matrix.csv` (synced to FE
   `contracts/permissions/permission-matrix.yaml`).
2. If a spec §21 key is **not** in the matrix → **stop** and use this ledger / raise OUTBOX.
   Never invent a client-side permission string.
3. Until a row below is `Decided`, treat the key as **blocked** for PermissionGate wiring.

## F01 (Closed)

| Spec / informal key | Matrix key | Decision |
|---------------------|------------|----------|
| `role.write` | `role.manage` | Rename — use `role.manage` only |
| `authenticated` | _(session gate)_ | Not a grantable permission |

## Remaining keys — proposed mapping (pending Backend AI Agent close per module)

Legend: **Reuse** = rename to existing matrix key · **Add** = needs new CSV row + HO if scope expands · **Defer** = out of current sprint

| Spec-referenced key | Proposed action | Target matrix key / note | Status |
|---------------------|-----------------|--------------------------|--------|
| `category.read` | Reuse | `catalog.read` | Proposed |
| `category.write` | Reuse | `catalog.write` | Proposed |
| `catalog.import` / `catalog.publish` | Add or keep shared | See GAP-001 (P2) | Open GAP-001 |
| `report.revenue.read` | Add or Reuse | Prefer `analytics.read` until report matrix exists | Proposed |
| `report.sla.read` | Add or Reuse | Prefer `analytics.read` | Proposed |
| `report.ai_quality.read` | Add or Reuse | Prefer `analytics.read` | Proposed |
| `inventory.read_movements` | Reuse | `inventory.read` | Proposed |
| `inventory.movement.read` | Reuse | `inventory.read` | Proposed |
| `inventory.reservation.read` | Reuse | `inventory.read` | Proposed |
| `channel.health.read` | Reuse | `channel.read` | Proposed |
| `channel.disconnect` | Reuse | `channel.manage` | Proposed |
| `channel.reauthorize` | Reuse | `channel.manage` | Proposed |
| `channel.webhook.read` | Reuse | `channel.read` | Proposed |
| `conversation.note.read` | Reuse | `conversation.read` | Proposed |
| `note.create` | Reuse | `conversation.write` | Proposed |
| `status.write` | Reuse | `conversation.write` | Proposed |
| `attachment.read` | Reuse | `conversation.read` | Proposed |
| `attachment.upload` | Reuse | `conversation.write` | Proposed |
| `ai.suggestion.*` | Reuse | `ai.suggest` / existing `ai.*` rows | Proposed — map per action |
| `ai.log.read` | Reuse | `ai.read` if present else Add | Proposed |
| `ai.blocked.read` | Reuse | `ai.read` | Proposed |
| `ai.source.read` | Reuse | `ai.read` | Proposed |
| `ai.prompt_internal.read` | Add | Distinct sensitivity — do not silently map | Open |
| `ai.sandbox.test` | Add or Reuse | `ai.manage` if exists | Proposed |
| `order.write` | Reuse | `order.create` / `order.update` as applicable | Proposed |
| `order.discount.apply` | Add or Reuse | Likely distinct — confirm before coding F08 | Open |
| `order.cost.read` | Add | Cost visibility often restricted | Open |
| `shipment.create` | Reuse | `fulfillment.write` / existing shipment key | Proposed |
| `packing_slip.read` / `.print` | Reuse | Fulfillment print permissions | Proposed |
| `customer.export` | Add | Export often audited separately | Open |
| `billing.write` | Reuse | Split across `billing.*` matrix rows | Proposed |
| `billing.usage.read` | Reuse | `billing.read` | Proposed |
| `billing.invoice.read` | Reuse | `billing.read` | Proposed |
| `billing.payment_method.write` | Add or Reuse | Confirm matrix | Open |
| `billing.plan.change` | Add | HO billing plans pending | Deferred (SIGNOFF) |
| `billing.cancel` | Add | HO billing plans pending | Deferred |
| `ops.alert.acknowledge` / `ops.ai.disable` / `ops.channel.manage` | Add or elevate | GAP-002 | Open GAP-002 |

## Close procedure (per module sprint)

1. Before FE wires PermissionGate for module Fx: filter this table to that module.
2. Backend AI Agent confirms each **Proposed** → **Decided** (edit CSV if Add; update OpenAPI `x-permission`).
3. FE syncs contracts; updates spec prose only after matrix change.
4. When all non-Defer rows for a module are Decided, annotate gap board GAP-003 with the slice date.

## Explicit non-goals

- Do not find-replace the entire FE spec in one pass.
- Do not add ~30 keys blindly “to match the spec” — prefer Reuse when blast radius is identical.
